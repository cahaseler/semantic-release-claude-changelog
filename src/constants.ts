/**
 * Default prompt template for Claude
 */
export const DEFAULT_PROMPT_TEMPLATE = `
Generate release notes for version {{version}} (released on {{date}}) of the {{repoName}} project.

Here are the commits that were included in this release:

\`\`\`json
{{commits}}
\`\`\`

IMPORTANT: Your response must contain ONLY the release notes in Markdown format, with no additional text, commentary, or explanations about your process. 

The release notes should:

1. Group changes by type (features, improvements, bug fixes, etc.)
2. Translate technical commit messages into user-friendly descriptions
3. Highlight important changes that users should be aware of
4. Be concise but informative
5. Use Markdown formatting

Focus on explaining what's new or changed from an end-user perspective, rather than implementation details. Omit commits that are purely technical (e.g., "fix typo", "merge branch", etc.) unless they fix important user-facing issues.

Format the notes with a clean structure using Markdown, starting with a brief summary of the release. Do not include any introductory statements like "here are the release notes" or explanations of your process.

AGAIN: Your response must only contain the final release notes in Markdown format - nothing else.
`;

/**
 * Plugin error messages
 */
export const ERROR_MESSAGES = {
  CLAUDE_NOT_FOUND: 'Claude Code CLI is required for this plugin. Please make sure it is installed and available in your PATH.'
};