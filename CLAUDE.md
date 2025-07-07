# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Development
- `npm run build` - Compile TypeScript to JavaScript (outputs to lib/)
- `npm run lint` - Run ESLint on all TypeScript files
- `npm test` - Run all unit tests with Jest
- `npm run integration-test` - Run Docker-based integration tests (requires ANTHROPIC_API_KEY in .env)

### Testing Individual Files
- `npx jest src/__tests__/generate-notes.test.ts` - Run a specific test file
- `npx jest --watch` - Run tests in watch mode for development

## Architecture Overview

This is a semantic-release plugin that integrates Claude Code CLI to generate user-friendly release notes. The plugin implements only the `generateNotes` step of semantic-release lifecycle.

### Core Flow
1. **Commit Retrieval**: Gets commits between releases using semantic-release's context
2. **Prompt Generation**: Formats commits with customizable template supporting placeholders ({{version}}, {{date}}, {{commits}}, etc.)
3. **Claude Integration**: Executes Claude Code CLI in headless mode with `--output-format stream-json`
4. **Output Processing**: Parses streaming JSON responses and optionally cleans output to extract only release notes

### Key Implementation Details

- **Streaming JSON**: Uses Claude's streaming JSON output format for reliable parsing of responses
- **Temporary Files**: Writes prompts to temp files to handle large content safely
- **Error Handling**: Gracefully falls back on Claude CLI errors with descriptive messages
- **Output Cleaning**: When `cleanOutput: true`, extracts content starting from version header (e.g., "## 1.2.0")

### Plugin Configuration
The plugin accepts these options via semantic-release config:
- `claudePath`: Path to Claude CLI (default: "claude")
- `promptTemplate`: Customizable prompt with placeholders and conditional blocks
- `maxCommits`: Limit commits processed (default: 100)
- `additionalContext`: Extra data like PRs/issues for richer release notes
- `cleanOutput`: Auto-extract release notes section (default: true)

### Testing Strategy
- Unit tests mock all external dependencies (execa, fs operations)
- Integration tests use Docker to test full semantic-release workflow
- Coverage requirements: 75% lines/statements, 60% functions, 45% branches