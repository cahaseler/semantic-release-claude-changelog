import { Context, PluginConfig } from "./types";
import { DEFAULT_PROMPT_TEMPLATE } from "./constants";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, unlinkSync } from "fs";
import { getCommits } from "./get-commits";
import { escapeText } from "./shell-escape";
import execa from "execa";

/**
 * Extracts the actual release notes section from Claude's response
 * Looks for a markdown header containing the version number as the start point
 */
export function extractReleaseNotes(text: string, version: string): string {
  // First, try to find a header with the exact version number
  // Escape backslashes first, then dots to prevent security issues with incomplete string escaping
  const versionHeaderRegex = new RegExp(
    `^##\\s+${version.replace(/\\/g, "\\\\").replace(/\./g, "\\.")}\\b`,
    "m"
  );
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

// Base text block
interface TextBlock {
  type: "text"; // More specific
  text: string;
}

// For tool use blocks within assistant messages
interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// For messages like: {"type":"system","subtype":"init",...}
interface ClaudeSystemInitMessage {
  type: "system";
  subtype: "init";
  session_id: string;
  tools: string[];
  mcp_servers: any[];
}

// For the content part of an assistant message
interface ClaudeAssistantContentMessage {
  id: string;
  type: "message"; // This is a sub-type within the assistant message wrapper
  role: "assistant";
  model: string;
  content: (TextBlock | ToolUseBlock)[]; // Content is an array of blocks
  stop_reason: string | null; // Can be null
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens: number;
  };
}

// Wrapper for assistant messages: {"type":"assistant","message":{...}}
interface ClaudeAssistantMessageWrapper {
  type: "assistant";
  message: ClaudeAssistantContentMessage;
  session_id: string;
}

// For tool result content within user messages
interface ClaudeUserToolResultMessage {
  tool_use_id: string;
  type: "tool_result";
  content: string | TextBlock[]; // More specific based on observed logs
  is_error?: boolean;
}

// Wrapper for user messages: {"type":"user","message":{...}}
interface ClaudeUserMessageWrapper {
  type: "user";
  message: {
    role: "user";
    content: ClaudeUserToolResultMessage[];
  };
  session_id: string;
}

// For the final result message: {"type":"result","subtype":"success", ...}
interface ClaudeFinalResultMessage {
  type: "result";
  subtype: "success" | "error"; // And potentially others
  cost_usd?: number;
  is_error: boolean;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  result?: string; // Present on success
  error?: unknown; // Present on error (structure unknown)
  total_cost?: number;
  session_id: string;
}

// Union of all possible top-level JSON objects in the stream
type ClaudeStreamOutputLine =
  | ClaudeSystemInitMessage
  | ClaudeAssistantMessageWrapper
  | ClaudeUserMessageWrapper
  | ClaudeFinalResultMessage;

/**
 * Generates release notes using Claude Code CLI
 */
export async function generateNotes(
  pluginConfig: PluginConfig,
  context: Context
): Promise<string> {
  const { logger } = context;
  const {
    claudePath = "claude",
    promptTemplate = DEFAULT_PROMPT_TEMPLATE,
    maxCommits = 100,
    cleanOutput = true,
    escaping = "shell",
  } = pluginConfig;

  // Get relevant commits between last and current release
  const commits = await getCommits(context, maxCommits);

  if (commits.length === 0) {
    logger.log("No commits found, using empty release notes");
    return "";
  }

  // Generate content for Claude prompt
  const releaseVersion = context.nextRelease?.version || "unknown";
  const repoUrl = context.options?.repositoryUrl || "";
  const repoName = repoUrl.split("/").pop()?.replace(".git", "") || "";

  // Format commit data
  const commitData = commits.map((commit) => {
    const { message, hash, committer, committerDate } = commit;

    const commitInfo = {
      message,
      hash: hash.substring(0, 7),
      date: committerDate,
      author: committer?.name || "Unknown",
    };

    return commitInfo;
  });

  // Prepare the prompt for Claude
  let prompt = promptTemplate
    .replace("{{version}}", releaseVersion)
    .replace("{{date}}", new Date().toISOString().split("T")[0])
    .replace("{{repoName}}", repoName)
    .replace("{{commits}}", JSON.stringify(commitData, null, 2));

  // Process additional context if provided
  if (pluginConfig.additionalContext) {
    // Add additional context if the template has the placeholder
    if (prompt.includes("{{#additionalContext}}")) {
      // Replace the whole conditional block in a more controlled way
      const contextString = JSON.stringify(
        pluginConfig.additionalContext,
        null,
        2
      );

      // Find the start of the conditional block
      const blockStart = prompt.indexOf("{{#additionalContext}}");
      if (blockStart !== -1) {
        // Find the end of the conditional block
        const blockEnd = prompt.indexOf("{{/additionalContext}}", blockStart);
        if (blockEnd !== -1) {
          // Replace just this specific block (avoiding regex with potential backtracking issues)
          const beforeBlock = prompt.substring(0, blockStart);
          const afterBlock = prompt.substring(
            blockEnd + "{{/additionalContext}}".length
          );
          prompt =
            beforeBlock +
            `Additional context information:\n\n\`\`\`json\n${contextString}\n\`\`\`` +
            afterBlock;
        }
      }
    } else {
      // If using a custom template without the conditional, try to find a good
      // place to add the context (after commits but before instructions)
      logger.log(
        "Custom template without additionalContext placeholder, appending context"
      );
      const contextString = JSON.stringify(
        pluginConfig.additionalContext,
        null,
        2
      );
      const additionalContextBlock = `\nAdditional context information:\n\n\`\`\`json\n${contextString}\n\`\`\`\n`;

      // Try to insert after the commits block
      if (prompt.includes("{{commits}}")) {
        const commitsPos = prompt.indexOf("{{commits}}");
        if (commitsPos !== -1) {
          const backticksPos = prompt.indexOf("```", commitsPos + 10);
          if (backticksPos !== -1) {
            const commitBlockEnd = backticksPos + 3;
            prompt =
              prompt.substring(0, commitBlockEnd) +
              additionalContextBlock +
              prompt.substring(commitBlockEnd);
          } else {
            // Fallback: just append to the end
            logger.log(
              "Could not find the end of the commits block. Appending additional context at the end."
            );
            prompt += additionalContextBlock;
          }
        }
      } else {
        // If we can't find a good place, just add it before "IMPORTANT:" if it exists
        const importantPos = prompt.indexOf("IMPORTANT:");
        if (importantPos !== -1) {
          logger.log(
            "Using fallback placement: Adding additional context before instructions."
          );
          prompt =
            prompt.substring(0, importantPos) +
            additionalContextBlock +
            prompt.substring(importantPos);
        } else {
          // Otherwise, just append to the end
          logger.log(
            "Could not find suitable location for additional context. Appending to the end of the prompt."
          );
          prompt += additionalContextBlock;
        }
      }
    }
  } else {
    // Remove the conditional block if no additional context is provided
    // Do this without using regex with potential backtracking issues
    let result = "";
    let currentPos = 0;
    let searching = true;

    while (searching) {
      const blockStart = prompt.indexOf("{{#additionalContext}}", currentPos);
      if (blockStart === -1) {
        // No more blocks found, add the rest of the prompt
        result += prompt.substring(currentPos);
        searching = false; // Exit condition
      } else {
        // Add the part before the block
        result += prompt.substring(currentPos, blockStart);

        // Find the end of this block (start searching after the opening tag)
        const blockEnd = prompt.indexOf(
          "{{/additionalContext}}",
          blockStart + "{{#additionalContext}}".length
        );
        if (blockEnd === -1) {
          // No matching end tag, keep the opening tag and the rest of the prompt
          result += prompt.substring(blockStart);
          searching = false; // Exit condition
        } else {
          // Skip this block and continue searching from after it
          currentPos = blockEnd + "{{/additionalContext}}".length;
        }
      }
    }
    prompt = result;
  }

  logger.log("Generating release notes with Claude...");

  try {
    // Create a timestamp for the temporary file
    const timestamp = new Date().getTime();
    const tmpFile = join(tmpdir(), `claude-prompt-${timestamp}.txt`);

    // Write the prompt to the temporary file
    writeFileSync(tmpFile, prompt);

    // Call Claude Code CLI in headless mode with the prompt
    logger.log(
      "Running Claude Code CLI in headless mode with streaming output"
    );

    const subprocess = execa(
      claudePath,
      ["-p", "--verbose", "--output-format", "stream-json", `@${tmpFile}`],
      {
        stdio: ["ignore", "pipe", "inherit"],
      }
    );

    // Capture stdout for processing
    let stdout = ""; // Reverted to 'stdout'
    if (subprocess.stdout) {
      subprocess.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        logger.log("Claude output:", chunk);
      });
      subprocess.stdout.on("error", (err) => {
        // Good to have error handling on stream
        logger.error("Claude stdout stream error during data collection:", err);
      });
    }

    try {
      await subprocess; // Wait for process to complete. This promise should resolve after stdout/stderr have closed.
    } catch (error) {
      // If subprocess itself throws (e.g., command not found, or if it's a rejecting promise from mock)
      // We might have partial stdout, or none. The current logic handles this by trying to parse `stdout` anyway.
      logger.error("Subprocess execution resulted in an error:", error);
      // Fallback will be used if stdout remains empty or unparseable.
    }

    // Clean up temp file
    unlinkSync(tmpFile);

    // Parse Claude's response from stream-json format and use the last valid message
    let responseText = "";
    try {
      const lines = stdout.split("\n").filter((line) => line.trim().length > 0);

      // Collect all valid JSON objects
      const parsedObjects: ClaudeStreamOutputLine[] = [];
      for (const line of lines) {
        try {
          parsedObjects.push(JSON.parse(line) as ClaudeStreamOutputLine);
        } catch (parseError) {
          // logger.log('Ignoring non-JSON line or parse error:', parseError, line);
        }
      }

      // Walk backwards to find the last final result message or a suitable assistant message
      for (let i = parsedObjects.length - 1; i >= 0; i--) {
        const streamLine = parsedObjects[i];

        // Priority 1: Final result message from Claude CLI
        if (
          streamLine.type === "result" &&
          streamLine.subtype === "success" &&
          typeof streamLine.result === "string"
        ) {
          responseText = streamLine.result;
          logger.log(`Found final result message at index ${i}.`);
          break;
        }

        // Priority 2: Last assistant message that contains text and indicates completion
        if (streamLine.type === "assistant") {
          const assistantContentMsg = streamLine.message;
          // Ensure it's a message from the assistant meant as final output
          if (
            assistantContentMsg.role === "assistant" &&
            assistantContentMsg.content &&
            assistantContentMsg.stop_reason === "end_turn" // Ensure it's a concluding message
          ) {
            if (Array.isArray(assistantContentMsg.content)) {
              const textBlocks = assistantContentMsg.content.filter(
                (c): c is TextBlock => c.type === "text" // Type guard for TextBlock
              );
              if (textBlocks.length > 0) {
                // Concatenate all text blocks from this final assistant message
                responseText = textBlocks.map((tb) => tb.text).join("\n");
                logger.log(
                  `Found 'end_turn' assistant message with text content at index ${i}.`
                );
                break;
              }
            }
          }
        }
      }

      // Fallback if nothing valid was parsed
      if (!responseText) {
        logger.log("No valid response found, using fallback message");
        responseText = "General fixes and updates";
      }
    } catch (e) {
      logger.error("Error parsing Claude output", e);
      responseText = "General fixes and updates";
    }

    logger.log("Successfully generated release notes");

    // If cleanOutput is enabled, extract just the release notes section
    let finalOutput: string;
    if (cleanOutput) {
      // Look for a markdown header with the version number as the starting point
      const cleanedResponse = extractReleaseNotes(
        responseText,
        context.nextRelease?.version || "unknown"
      );
      logger.log("Cleaned release notes to remove any AI preamble");
      finalOutput = cleanedResponse.trim();
    } else {
      // Return the raw output if cleaning is disabled
      logger.log("Skipping output cleaning (disabled by configuration)");
      finalOutput = responseText.trim();
    }
    
    // Apply escaping based on configuration
    const escapedOutput = escapeText(finalOutput, escaping);
    if (escaping === 'shell') {
      logger.log("Applied shell escaping to release notes");
    }
    
    return escapedOutput;
  } catch (error) {
    logger.error("Error generating release notes with Claude", error);
    return "## Release Notes\n\nNo release notes generated due to an error.";
  }
}
