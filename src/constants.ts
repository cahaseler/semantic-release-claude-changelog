/**
 * Default prompt template for Claude
 */
export const DEFAULT_PROMPT_TEMPLATE = `
Generate release notes for version {{version}} (released on {{date}}) of the {{repoName}} project.

Here are the commits that were included in this release:

\`\`\`json
{{commits}}
\`\`\`

{{#additionalContext}}
Additional context information:

\`\`\`json
{{additionalContext}}
\`\`\`
{{/additionalContext}}

IMPORTANT: Your response must contain ONLY the release notes in Markdown format, with no additional text, commentary, or explanations about your process. DO NOT include any phrases like "Based on my analysis" or "Here are the release notes". Start DIRECTLY with the markdown heading for the version (e.g., "## 1.2.3 (2023-05-15)").

The release notes should:

1. Group changes by type (features, improvements, bug fixes, etc.)
2. Translate technical commit messages into user-friendly descriptions
3. Highlight important changes that users should be aware of
4. Be concise but informative
5. Use Markdown formatting with bold titles using ** for emphasis

Focus on explaining what's new or changed from an end-user perspective, rather than implementation details. Omit commits that are purely technical (e.g., "fix typo", "merge branch", etc.) unless they fix important user-facing issues.

Here are examples of the exact format expected:

EXAMPLE 1:
\`\`\`
## 1.1.0 (2025-05-14)

### Features
- **Streamlined Operation**: Refactored plugin to use only the generateNotes functionality, resulting in a simpler and more focused plugin that aligns better with semantic-release's single-responsibility pattern.

### Bug Fixes
- **Dependency Management**: Removed circular dependency in package.json where the plugin was incorrectly listed as its own dependency, preventing potential installation issues.

### Important Notes
- Users now need to install Claude Code CLI separately as the plugin no longer handles this during the prepare step.
\`\`\`

EXAMPLE 2:
\`\`\`
## 2.0.0 (2025-04-20)

### Breaking Changes
- **Node.js**: Dropped support for Node.js versions below 16.x

### Features
- **Performance**: Improved JSON parsing speed by 40%
- **Security**: Added automatic sanitization of commit messages

### Bug Fixes
- **Windows Support**: Fixed path handling issues on Windows systems
\`\`\`

EXAMPLE 3:
\`\`\`
## 1.0.5 (2025-03-10)

### Bug Fixes
- **Dependencies**: Updated vulnerable dependencies to secure versions
- **API**: Fixed inconsistent error responses when API requests fail

### Performance
- **Memory Usage**: Reduced memory consumption during large changelog generation
\`\`\`

Your response must ONLY contain the release notes in Markdown format - nothing else. Start directly with the version header (## followed by the version number).
`;

/**
 * Plugin error messages
 */
export const ERROR_MESSAGES = {
  CLAUDE_NOT_FOUND: 'Claude Code CLI is required for this plugin. Please install it separately with: npm install -g @anthropic-ai/claude-code'
};