/**
 * Default prompt template for Claude
 */
export const DEFAULT_PROMPT_TEMPLATE = `OUTPUT ONLY the release notes for {{repoName}} version {{version}}.

Commits to process:
\`\`\`json
{{commits}}
\`\`\`

{{#additionalContext}}Additional context:
\`\`\`json
{{additionalContext}}
\`\`\`
{{/additionalContext}}

Format as markdown with these sections (only if changes exist):
- ### Features (new functionality)
- ### Improvements (changes to existing features)
- ### Bug Fixes (resolved problems)
- ### Security (always just "Updated dependencies" unless action needed)

Rules:
- One sentence per item
- User-focused changes only
- Skip: docs, tests, CI/CD, internal refactors, build config
- NO explanations, NO summaries, NO meta-commentary about these rules

Example output format:
## {{repoName}} {{version}}

### Features
- Added image upload and analysis

### Bug Fixes
- Fixed search overflow issue
`;

/**
 * Plugin error messages
 */
export const ERROR_MESSAGES = {
  CLAUDE_NOT_FOUND: 'Claude Code CLI is required for this plugin. Please install it separately with: npm install -g @anthropic-ai/claude-code'
};