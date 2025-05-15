import { Context, PluginConfig } from './types';
import { DEFAULT_PROMPT_TEMPLATE } from './constants';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';
import { getCommits } from './get-commits';
import execa from 'execa';

/**
 * Extracts the actual release notes section from Claude's response
 * Looks for a markdown header containing the version number as the start point
 */
export function extractReleaseNotes(text: string, version: string): string {
  // First, try to find a header with the exact version number
  // Escape backslashes first, then dots to prevent security issues with incomplete string escaping
  const versionHeaderRegex = new RegExp(`^##\\s+${version.replace(/\\/g, '\\\\').replace(/\./g, '\\.')}\\b`, 'm');
  const versionHeaderMatch = text.match(versionHeaderRegex);
  
  if (versionHeaderMatch && versionHeaderMatch.index !== undefined) {
    // Return everything from the version header to the end
    return text.substring(versionHeaderMatch.index);
  }
  
  // If we can't find the exact version, look for any markdown h2 header
  // This handles cases where version might be formatted differently (with date, etc.)
  const anyHeaderMatch = text.match(/^##\s+/m);
  if (anyHeaderMatch && anyHeaderMatch.index !== undefined) {
    return text.substring(anyHeaderMatch.index);
  }
  
  // If we still can't find a proper header, return the original text
  // At least we tried to clean it up!
  return text;
}

// Define interfaces for Claude output format
interface TextBlock {
  type: string;
  text: string;
}

interface SystemMessage {
  role: string;
  result: string;
}

interface AssistantMessage {
  role: string;
  content: string | TextBlock[];
}

type ClaudeMessage = SystemMessage | AssistantMessage;

/**
 * Generates release notes using Claude Code CLI
 */
export async function generateNotes(
  pluginConfig: PluginConfig,
  context: Context
): Promise<string> {
  const { logger } = context;
  const {
    claudePath = 'claude',
    promptTemplate = DEFAULT_PROMPT_TEMPLATE,
    maxCommits = 100,
    cleanOutput = true
  } = pluginConfig;

  // Get relevant commits between last and current release
  const commits = await getCommits(context, maxCommits);
  
  if (commits.length === 0) {
    logger.log('No commits found, using empty release notes');
    return '';
  }

  // Generate content for Claude prompt
  const releaseVersion = context.nextRelease?.version || 'unknown';
  const repoUrl = context.options?.repositoryUrl || '';
  const repoName = repoUrl.split('/').pop()?.replace('.git', '') || '';
  
  // Format commit data
  const commitData = commits.map(commit => {
    const { message, hash, committer, committerDate } = commit;
    
    const commitInfo = {
      message,
      hash: hash.substring(0, 7),
      date: committerDate,
      author: committer?.name || 'Unknown'
    };
    
    return commitInfo;
  });
  
  // Prepare the prompt for Claude
  let prompt = promptTemplate
    .replace('{{version}}', releaseVersion)
    .replace('{{date}}', new Date().toISOString().split('T')[0])
    .replace('{{repoName}}', repoName)
    .replace('{{commits}}', JSON.stringify(commitData, null, 2));
  
  // Process additional context if provided
  if (pluginConfig.additionalContext) {
    // Add additional context if the template has the placeholder
    if (prompt.includes('{{#additionalContext}}')) {
      // Replace the whole conditional block in a more controlled way
      const contextString = JSON.stringify(pluginConfig.additionalContext, null, 2);
      
      // Find the start of the conditional block
      const blockStart = prompt.indexOf('{{#additionalContext}}');
      if (blockStart !== -1) {
        // Find the end of the conditional block
        const blockEnd = prompt.indexOf('{{/additionalContext}}', blockStart);
        if (blockEnd !== -1) {
          // Replace just this specific block (avoiding regex with potential backtracking issues)
          const beforeBlock = prompt.substring(0, blockStart);
          const afterBlock = prompt.substring(blockEnd + '{{/additionalContext}}'.length);
          prompt = beforeBlock + 
                  `Additional context information:\n\n\`\`\`json\n${contextString}\n\`\`\`` + 
                  afterBlock;
        }
      }
    } else {
      // If using a custom template without the conditional, try to find a good
      // place to add the context (after commits but before instructions)
      logger.log('Custom template without additionalContext placeholder, appending context');
      const contextString = JSON.stringify(pluginConfig.additionalContext, null, 2);
      const additionalContextBlock = `\nAdditional context information:\n\n\`\`\`json\n${contextString}\n\`\`\`\n`;
      
      // Try to insert after the commits block
      if (prompt.includes('{{commits}}')) {
        const commitsPos = prompt.indexOf('{{commits}}');
        if (commitsPos !== -1) {
          const backticksPos = prompt.indexOf('```', commitsPos + 10);
          if (backticksPos !== -1) {
            const commitBlockEnd = backticksPos + 3;
            prompt = prompt.substring(0, commitBlockEnd) + additionalContextBlock + prompt.substring(commitBlockEnd);
          } else {
            // Fallback: just append to the end
            logger.log('Could not find the end of the commits block. Appending additional context at the end.');
            prompt += additionalContextBlock;
          }
        }
      } else {
        // If we can't find a good place, just add it before "IMPORTANT:" if it exists
        const importantPos = prompt.indexOf('IMPORTANT:');
        if (importantPos !== -1) {
          logger.log('Using fallback placement: Adding additional context before instructions.');
          prompt = prompt.substring(0, importantPos) + additionalContextBlock + prompt.substring(importantPos);
        } else {
          // Otherwise, just append to the end
          logger.log('Could not find suitable location for additional context. Appending to the end of the prompt.');
          prompt += additionalContextBlock;
        }
      }
    }
  } else {
    // Remove the conditional block if no additional context is provided
    // Do this without using regex with potential backtracking issues
    let result = "";
    let currentPos = 0;
    
    while (true) {
      const blockStart = prompt.indexOf('{{#additionalContext}}', currentPos);
      if (blockStart === -1) {
        // No more blocks found, add the rest of the prompt
        result += prompt.substring(currentPos);
        break;
      }
      
      // Add the part before the block
      result += prompt.substring(currentPos, blockStart);
      
      // Find the end of this block
      const blockEnd = prompt.indexOf('{{/additionalContext}}', blockStart);
      if (blockEnd === -1) {
        // No matching end tag, just keep the rest as is
        result += prompt.substring(blockStart);
        break;
      }
      
      // Skip this block and continue from after it
      currentPos = blockEnd + '{{/additionalContext}}'.length;
    }
    
    prompt = result;
  }

  logger.log('Generating release notes with Claude...');
  
  try {
    // Create a timestamp for the temporary file
    const timestamp = new Date().getTime();
    const tmpFile = join(tmpdir(), `claude-prompt-${timestamp}.txt`);
    
    // Write the prompt to the temporary file
    writeFileSync(tmpFile, prompt);
    
    // Call Claude Code CLI in headless mode with the prompt
    logger.log('Running Claude Code CLI in headless mode with streaming output');
    
    // Use execa with stdio: 'inherit' to show output in real-time
    const subprocess = execa(claudePath, [
      '-p',                        // Headless mode with prompt
      '--verbose',                 // Verbose output
      '--output-format', 'stream-json',   // Stream JSON output
      `@${tmpFile}`                // Use file content as prompt
    ], {
      stdio: ['ignore', 'pipe', 'inherit'] // Pipe stdout but show stderr directly
    });
    
    // Capture stdout for processing
    let stdout = '';
    if (subprocess.stdout) {
      subprocess.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        logger.log('Claude output:', chunk);
      });
    }
    
    // Wait for process to complete
    await subprocess;
    
    // Clean up temp file
    unlinkSync(tmpFile);
    
    // Parse Claude's response from stream-json format, prioritizing the system result
    let responseText = '';
    try {
      // With stream-json, the output is a series of JSON objects, one per line
      const lines = stdout.split('\n').filter(line => line.trim().length > 0);
      
      // First, look for the system result message (the official final result)
      let systemResult = '';
      for (const line of lines) {
        try {
          const jsonObj = JSON.parse(line);
          if (jsonObj.role === 'system' && jsonObj.result) {
            systemResult = jsonObj.result;
            break;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
      
      // If we found a system result, use it
      if (systemResult) {
        logger.log('Using system result message');
        responseText = systemResult;
      } 
      // If no system result, fall back to assistant messages
      else {
        logger.log('No system result found, falling back to assistant messages');
        
        // Collect text from assistant messages
        for (const line of lines) {
          try {
            const jsonObj = JSON.parse(line);
            
            // Extract text from assistant messages
            if (jsonObj.role === 'assistant' && jsonObj.type === 'message') {
              if (Array.isArray(jsonObj.content)) {
                // Find text content blocks (exclude tool_use blocks)
                const textBlocks = jsonObj.content.filter((c: any) => c.type === 'text');
                if (textBlocks.length > 0) {
                  const text = textBlocks.map((b: any) => b.text).join('\n');
                  responseText += text;
                }
              } else if (typeof jsonObj.content === 'string') {
                responseText += jsonObj.content;
              }
            } else if (jsonObj.role === 'assistant' && jsonObj.type === 'content_block') {
              // Handle individual content blocks in stream mode
              if (jsonObj.content_block.type === 'text') {
                responseText += jsonObj.content_block.text;
              }
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
      
      // If still no text, use raw stdout
      if (!responseText) {
        logger.log('No valid response found, using raw stdout');
        responseText = stdout;
      }
    } catch (e) {
      // If parsing fails, use the raw output
      logger.error('Error parsing Claude output', e);
      responseText = stdout;
    }
    
    logger.log('Successfully generated release notes');
    
    // If cleanOutput is enabled, extract just the release notes section
    if (cleanOutput) {
      // Look for a markdown header with the version number as the starting point
      const cleanedResponse = extractReleaseNotes(responseText, context.nextRelease?.version || 'unknown');
      logger.log('Cleaned release notes to remove any AI preamble');
      return cleanedResponse.trim();
    } else {
      // Return the raw output if cleaning is disabled
      logger.log('Skipping output cleaning (disabled by configuration)');
      return responseText.trim();
    }
  } catch (error) {
    logger.error('Error generating release notes with Claude', error);
    return '## Release Notes\n\nNo release notes generated due to an error.';
  }
}