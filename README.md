# semantic-release-claude-changelog

A [semantic-release](https://github.com/semantic-release/semantic-release) plugin that uses Claude Code CLI in headless mode to generate high-quality release notes suitable for end users based on commit information.

## Installation

```bash
npm install --save-dev semantic-release-claude-changelog
```

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- Node.js 16.x or higher
- semantic-release 18.x or higher
- ANTHROPIC_API_KEY environment variable set

## Usage

The plugin can be configured in the [**semantic-release** configuration file](https://github.com/semantic-release/semantic-release/blob/master/docs/usage/configuration.md#configuration):

```json
{
  "plugins": [
    "@semantic-release/commit-analyzer",
    "semantic-release-claude-changelog",
    "@semantic-release/npm",
    "@semantic-release/github"
  ]
}
```

## Configuration

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `claudePath` | Path to the Claude Code CLI executable | `claude` |
| `promptTemplate` | Template for the prompt sent to Claude | See [Default Prompt Template](#default-prompt-template) |
| `maxCommits` | Maximum number of commits to include in the prompt | `100` |
| `additionalContext` | Additional context information (PRs, issues, etc.) | `undefined` |
| `cleanOutput` | Whether to automatically extract only the release notes section | `true` |
| `escaping` | How to escape the output: `'shell'` (escapes quotes and special chars) or `'none'` | `'shell'` |

### Default Prompt Template

The default prompt template used can be customized according to your needs:

```
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

IMPORTANT: Your response must contain ONLY the release notes in Markdown format, with no additional text, commentary, or explanations about your process. DO NOT include any phrases like "Based on my analysis" or "Here are the release notes".

The release notes should:

1. Group changes by type (features, improvements, bug fixes, etc.)
2. Translate technical commit messages into user-friendly descriptions
3. Highlight important changes that users should be aware of
4. Be concise but informative
5. Use Markdown formatting with bold titles using ** for emphasis

Focus on explaining what's new or changed from an end-user perspective, rather than implementation details. Omit commits that are purely technical (e.g., "fix typo", "merge branch", etc.) unless they fix important user-facing issues.

Your response must ONLY contain the release notes in Markdown format - nothing else. Start directly with the version header.
```

You can customize this template to match your project's needs.

#### Custom Prompt Template Requirements

When creating a custom prompt template, make sure to include these placeholders:

**Required placeholders:**
- `{{commits}}` - The commit data in JSON format (⚠️ **Without this, no commit data will be included!**)

**Recommended placeholders:**
- `{{version}}` - The version number being released
- `{{date}}` - The release date
- `{{repoName}}` - The repository name
- `{{#additionalContext}}...{{/additionalContext}}` - Conditional block for additional context (PRs, issues, etc.)

**Example custom template:**
```json
{
  "plugins": [
    ["semantic-release-claude-changelog", {
      "promptTemplate": "Generate user-friendly release notes for {{repoName}} version {{version}}.\n\nCommits:\n```json\n{{commits}}\n```\n\n{{#additionalContext}}Context:\n```json\n{{additionalContext}}\n```\n{{/additionalContext}}\n\nFocus on security updates and breaking changes."
    }]
  ]
}
```

**Important:** The plugin will warn you if your custom template is missing required placeholders. Always test your custom templates to ensure they generate appropriate release notes.

### Output Cleaning

By default, the plugin will attempt to clean Claude's response to extract only the actual release notes section. This is done by:

1. Looking for a markdown header containing the version number (e.g., `## 1.2.0`)
2. Extracting everything from that header to the end of the text
3. Removing any preamble text that Claude might add (like "Now I'll analyze these commits...")

This ensures the final release notes are clean and ready to use without manual editing.

You can disable this behavior by setting `cleanOutput: false` in your configuration:

```json
{
  "plugins": [
    "@semantic-release/commit-analyzer",
    ["semantic-release-claude-changelog", {
      "cleanOutput": false
    }],
    "@semantic-release/npm",
    "@semantic-release/github"
  ]
}
```

If you're using a custom prompt that doesn't follow the standard markdown header format, you might want to disable automatic cleaning.

### Shell Escaping

By default, the plugin escapes special characters in the generated release notes to ensure they work safely in shell commands. This prevents issues when semantic-release plugins use `${nextRelease.notes}` in shell contexts.

The following characters are escaped:
- Single quotes (`'`) → `'\''`
- Double quotes (`"`) → `\"`
- Backslashes (`\`) → `\\`
- Dollar signs (`$`) → `\$`
- Backticks (`` ` ``) → `` \` ``

This ensures that release notes containing words like "weren't" or "can't" won't break shell commands in downstream plugins.

If you need the raw, unescaped output (for example, if you're not using the notes in shell commands), you can disable escaping:

```json
{
  "plugins": [
    "@semantic-release/commit-analyzer",
    ["semantic-release-claude-changelog", {
      "escaping": "none"
    }],
    "@semantic-release/npm",
    "@semantic-release/github"
  ]
}
```

### Using Additional Context

The plugin supports providing additional context information to enrich the generated release notes. This context is passed to Claude Code CLI along with the commit information, allowing it to generate more comprehensive and informative release notes.

Examples of additional context you might want to include:
- Pull request information (numbers, titles, URLs)
- Issue details (numbers, titles, URLs)
- Contributors
- API changes
- Sprint/milestone data

To use this feature, provide an `additionalContext` object in your configuration:

```json
{
  "plugins": [
    "@semantic-release/commit-analyzer",
    ["semantic-release-claude-changelog", {
      "additionalContext": {
        "pullRequests": [
          { "number": 123, "title": "Add new feature", "url": "https://github.com/user/repo/pull/123" }
        ],
        "issues": [
          { "number": 456, "title": "Fix bug in feature", "url": "https://github.com/user/repo/issues/456" }
        ]
      }
    }],
    "@semantic-release/npm",
    "@semantic-release/github"
  ]
}
```

For dynamic integration with GitHub Actions, see the [examples directory](examples/) for sample workflows showing how to gather PR and issue information and pass it to the plugin.

## GitHub Actions Configuration

When using this plugin in GitHub Actions, you need to install Claude Code CLI and set up the ANTHROPIC_API_KEY:

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3
        with:
          fetch-depth: 0
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci
      - name: Install Claude Code CLI
        run: npm install -g @anthropic-ai/claude-code
      - name: Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: npx semantic-release
```

## Development

### Unit Testing

To run the unit tests:

```bash
npm test
```

### Integration Testing

To run the integration tests:

1. Copy the `.env.example` file to `.env` and add your Anthropic API key:
   ```bash
   cp .env.example .env
   # Edit .env to add your API key
   ```

2. Run the integration test:
   ```bash
   npm run integration-test
   ```

The integration test:
- Creates a Docker container with a test repository
- Sets up semantic-release with the plugin
- Runs the plugin with real commits
- Validates that release notes are generated
- Outputs the generated release notes for manual inspection

## How It Works
The plugin focuses solely on generating release notes and works as follows:

1. In the `generateNotes` step, the plugin:
   - Gets commits between the last release and the current one
   - Formats the commit information
   - Processes any additional context information (PRs, issues, etc.)
   - Applies the prompt template
   - Calls Claude Code CLI in headless mode
   - Parses the response and returns the generated release notes

Note: You need to install Claude Code CLI separately as this plugin no longer handles the installation during the prepare step.

## License

This project is released under [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) (Creative Commons Zero v1.0 Universal). You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission.
