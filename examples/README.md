# Additional Context for Changelog Generation

This directory contains examples of how to provide additional context to the `semantic-release-claude-changelog` plugin to enhance your generated release notes.

## Why Use Additional Context?

When generating changelogs, it's often useful to include more information than just commit messages. Additional context such as:

- Pull request details (titles, authors, labels, descriptions)
- Issue information (titles, status, labels, descriptions)
- Contributors (names, email addresses)
- Repository metadata
- API changes or breaking changes
- Sprint/milestone data

This enriches your changelogs and makes them more useful to your users, providing a more complete picture of what changed and why.

## Usage

The plugin accepts an `additionalContext` option that can contain any structured data that might be useful for your changelog. This data is passed to Claude Code CLI to help it generate more meaningful release notes.

### Example GitHub Actions Workflow

The [github-workflow.yml](github-workflow.yml) file demonstrates how to:

1. Collect comprehensive information about pull requests and issues related to the release
2. Extract contributor information from the commit history
3. Format all data as a structured JSON object
4. Pass it to the semantic-release plugin

#### Key Features of the Example Workflow

- **Advanced PR Detection**: Identifies PRs referenced in commit messages using multiple patterns:
  - PR numbers in subject lines (#123)
  - Merge commit references (Merge pull request #123)
  - Other common PR reference formats (PR: #123, pull-request: #123)

- **Comprehensive Issue Linking**: Finds issues mentioned in commit messages with patterns like:
  - Closes #123
  - Fixes #123
  - Resolves #123
  - Addresses #123
  - Issue #123
  - Ref #123

- **Rich Metadata**: Collects detailed information using GitHub CLI:
  - For PRs: number, title, URL, labels, author, body, base/head branches, merge date
  - For issues: number, title, URL, labels, author, body, state, creation date
  - For contributors: name and email address

- **Robust Error Handling**: Includes checks and fallbacks to ensure the workflow succeeds even if:
  - No previous tags exist
  - Some PRs or issues are not accessible
  - Referenced issues are in external repositories

### Configuration Example

The [releaserc.json](releaserc.json) file shows how to configure semantic-release to use the additional context in the Claude prompt, including:

1. A custom template that demonstrates how to format the additional context
2. Conditional sections that only appear when data is available
3. Special formatting for different types of information

## Modifying the Template

You can also customize the prompt template to make better use of the additional context. The default template includes a conditional section for additional context, but you can modify it to emphasize specific information.

Example of a custom template that highlights pull requests:

```javascript
const config = {
  plugins: [
    ["semantic-release-claude-changelog", {
      promptTemplate: `
Generate release notes for version {{version}} of {{repoName}}.

Here are the commits:
\`\`\`json
{{commits}}
\`\`\`

{{#additionalContext}}
Pull Requests in this release:
{{#pullRequests}}
- #{{number}}: {{title}} ({{url}})
{{/pullRequests}}

Issues addressed:
{{#issues}}
- #{{number}}: {{title}} ({{url}})
{{/issues}}
{{/additionalContext}}

Format the notes with markdown headings grouping similar changes.
      `,
      additionalContext: {
        // Your context here
      }
    }]
  ]
}
```

## Best Practices

1. **Structured Data**: Provide context as structured JSON objects rather than raw text
2. **Minimal Data**: Include only relevant information that will help generate better release notes
3. **Template Customization**: Adjust the prompt template to best utilize the additional context