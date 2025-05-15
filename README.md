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