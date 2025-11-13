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

This is a semantic-release plugin that integrates the Claude Agent SDK to generate user-friendly release notes. The plugin implements only the `generateNotes` step of semantic-release lifecycle.

### Core Flow
1. **Commit Retrieval**: Gets commits between releases using semantic-release's context
2. **Prompt Generation**: Formats commits with customizable template supporting placeholders ({{version}}, {{date}}, {{commits}}, etc.)
3. **Claude Integration**: Calls the Claude Agent SDK's `query` function to generate release notes
4. **Output Processing**: Processes SDK responses and optionally cleans output to extract only release notes

### Key Implementation Details

- **SDK Integration**: Uses the Claude Agent SDK's async iterator pattern to receive responses
- **Error Handling**: Gracefully falls back on SDK errors with descriptive messages
- **Output Cleaning**: When `cleanOutput: true`, extracts content starting from version header (e.g., "## 1.2.0")

### Plugin Configuration
The plugin accepts these options via semantic-release config:
- `promptTemplate`: Customizable prompt with placeholders and conditional blocks
- `maxCommits`: Limit commits processed (default: 100)
- `maxTurns`: Maximum number of turns for Claude interactions (default: 10)
- `additionalContext`: Extra data like PRs/issues for richer release notes
- `cleanOutput`: Auto-extract release notes section (default: true)

### Testing Strategy
- Unit tests mock the Claude Agent SDK
- Integration tests use Docker to test full semantic-release workflow
- Coverage requirements: 75% lines/statements, 60% functions, 45% branches