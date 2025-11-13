import { Context, PluginConfig } from "./types";
import { DEFAULT_PROMPT_TEMPLATE } from "./constants";
import { getCommits } from "./get-commits";
import { escapeText } from "./shell-escape";
import { query } from "@anthropic-ai/claude-agent-sdk";

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

/**
 * Generates release notes using Claude Agent SDK
 */
export async function generateNotes(
  pluginConfig: PluginConfig,
  context: Context
): Promise<string> {
  const { logger } = context;
  const {
    promptTemplate = DEFAULT_PROMPT_TEMPLATE,
    maxCommits = 100,
    cleanOutput = true,
    escaping = "shell",
    maxTurns = 10,
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

  // Validate custom prompt template if provided
  if (pluginConfig.promptTemplate) {
    // Check for required placeholders
    if (!promptTemplate.includes("{{commits}}")) {
      logger.warn(
        "⚠️  Custom prompt template is missing {{commits}} placeholder - commit data will not be included in the prompt!"
      );
      logger.warn(
        "Consider adding {{commits}} to your template or using the default template."
      );
    }
    
    // Warn about other useful placeholders
    const missingPlaceholders = [];
    if (!promptTemplate.includes("{{version}}")) {
      missingPlaceholders.push("{{version}}");
    }
    if (!promptTemplate.includes("{{date}}")) {
      missingPlaceholders.push("{{date}}");
    }
    if (!promptTemplate.includes("{{repoName}}")) {
      missingPlaceholders.push("{{repoName}}");
    }
    
    if (missingPlaceholders.length > 0) {
      logger.log(
        `ℹ️  Custom prompt template is missing optional placeholders: ${missingPlaceholders.join(", ")}`
      );
    }
    
    // Check for conditional context block if additionalContext is provided
    if (pluginConfig.additionalContext && !promptTemplate.includes("{{#additionalContext}}")) {
      logger.warn(
        "⚠️  Custom prompt template is missing {{#additionalContext}}...{{/additionalContext}} block - additional context will be appended to the end of the prompt."
      );
    }
  }

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

  logger.log("Generating release notes with Claude Agent SDK...");

  try {
    // Call Claude Agent SDK with the prompt
    let responseText = "";

    for await (const msg of query({
      prompt,
      options: { maxTurns }
    })) {
      // Log progress messages
      if (msg.type === "assistant" || msg.type === "user") {
        logger.log("Claude processing...");
      }

      // Get the final result
      if (msg.type === "result") {
        if (msg.subtype === "success" && "result" in msg) {
          responseText = msg.result;
          logger.log("Successfully received response from Claude");
        } else {
          logger.log("No result in final message or error occurred, using fallback");
          responseText = "General fixes and updates";
        }
      }
    }

    // Fallback if no response was received
    if (!responseText) {
      logger.log("No valid response found, using fallback message");
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
