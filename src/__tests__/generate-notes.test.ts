import { generateNotes, extractReleaseNotes } from "../generate-notes";
import { getCommits } from "../get-commits";

// Mock dependencies
jest.mock("../get-commits");

// Mock the Claude Agent SDK
jest.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: jest.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
const mockedQuery = query as jest.MockedFunction<typeof query>;

// Helper to create a mock async iterator for Claude SDK responses
async function* createMockQueryResponse(result: string) {
  yield { type: "assistant" as const };
  yield { type: "result" as const, subtype: "success" as const, result };
}

const setDefaultQueryImplementation = () => {
  mockedQuery.mockImplementation(() => {
    return createMockQueryResponse("## Release Notes\n\nGreat release!");
  });
};

setDefaultQueryImplementation();

describe("generateNotes", () => {
  const mockContext: any = {
    logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
    nextRelease: { version: "1.0.0" },
    options: { repositoryUrl: "https://github.com/user/repo.git" },
  };

  const mockCommits = [
    {
      message: "feat: add new feature",
      hash: "abc1234",
      committer: { name: "Developer 1" },
      committerDate: "2023-01-01",
    },
  ];

  const mockAdditionalContext = {
    pullRequests: [
      {
        number: 123,
        title: "Add new feature",
        url: "https://github.com/user/repo/pull/123",
      },
    ],
    issues: [
      {
        number: 456,
        title: "Bug in feature",
        url: "https://github.com/user/repo/issues/456",
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCommits as jest.Mock).mockResolvedValue(mockCommits);
    setDefaultQueryImplementation();
  });

  it("should return empty string when no commits are found", async () => {
    (getCommits as jest.Mock).mockResolvedValue([]);
    const notes = await generateNotes({}, mockContext);
    expect(notes).toBe("");
    expect(mockContext.logger.log).toHaveBeenCalledWith(
      "No commits found, using empty release notes"
    );
  });

  it("should generate release notes with Claude", async () => {
    const _notes = await generateNotes({}, mockContext);
    expect(getCommits).toHaveBeenCalledWith(mockContext, 100);
    expect(mockedQuery).toHaveBeenCalled();
  });

  it("should handle Claude SDK errors", async () => {
    mockedQuery.mockImplementationOnce(() => {
      throw new Error("Claude SDK error");
    });
    const notes = await generateNotes({}, mockContext);
    expect(notes).toBe(
      "## Release Notes\n\nNo release notes generated due to an error."
    );
    expect(mockContext.logger.error).toHaveBeenCalledWith(
      "Error generating release notes with Claude",
      expect.any(Error)
    );
  });

  it("should include additional context in the prompt when provided", async () => {
    await generateNotes(
      { additionalContext: mockAdditionalContext },
      mockContext
    );
    expect(mockedQuery).toHaveBeenCalled();
    const promptArg = mockedQuery.mock.calls[0][0].prompt;
    expect(promptArg).toContain("Additional context information");
    expect(promptArg).toContain(JSON.stringify(mockAdditionalContext, null, 2));
  });

  it("should not include additional context section when not provided", async () => {
    await generateNotes({}, mockContext);
    expect(mockedQuery).toHaveBeenCalled();
    const promptArg = mockedQuery.mock.calls[0][0].prompt;
    expect(promptArg).not.toContain("Additional context information");
  });

  it("should work with custom template and additionalContext", async () => {
    const customTemplate =
      "Custom template {{version}} with {{#additionalContext}}Additional context{{/additionalContext}}";
    await generateNotes(
      {
        promptTemplate: customTemplate,
        additionalContext: mockAdditionalContext,
      },
      mockContext
    );
    expect(mockedQuery).toHaveBeenCalled();
    const promptArg = mockedQuery.mock.calls[0][0].prompt;
    expect(promptArg).toContain("Custom template 1.0.0");
    expect(promptArg).toContain("Additional context");
    expect(promptArg).not.toContain("{{additionalContext}}");
  });

  it("should handle custom template without conditional blocks", async () => {
    const customTemplate =
      "Custom template {{version}} with {{commits}} IMPORTANT: instructions";
    await generateNotes(
      {
        promptTemplate: customTemplate,
        additionalContext: mockAdditionalContext,
      },
      mockContext
    );
    expect(mockedQuery).toHaveBeenCalled();
    const promptArg = mockedQuery.mock.calls[0][0].prompt as string;
    expect(promptArg).toContain("Custom template 1.0.0");
    expect(promptArg).toContain("IMPORTANT:");
    const commitBlockEnd = promptArg.indexOf("```", promptArg.indexOf("with"));
    const importantIndex = promptArg.indexOf("IMPORTANT:");
    const additionalContextIndex = promptArg.indexOf(
      "Additional context information"
    );
    expect(commitBlockEnd).not.toBe(-1);
    expect(importantIndex).not.toBe(-1);
    expect(additionalContextIndex).not.toBe(-1);
    expect(additionalContextIndex).toBeGreaterThan(0);
    expect(additionalContextIndex).toBeLessThan(importantIndex);
  });

  it("should handle custom template with no backticks or IMPORTANT marker", async () => {
    const customTemplate = "Custom template {{version}} with {{commits}}";
    await generateNotes(
      {
        promptTemplate: customTemplate,
        additionalContext: mockAdditionalContext,
      },
      mockContext
    );
    expect(mockedQuery).toHaveBeenCalled();
    const promptArg = mockedQuery.mock.calls[0][0].prompt;
    expect(promptArg).toContain("Custom template 1.0.0");
    expect(promptArg).toContain("Additional context information");
  });

  it("should handle template with nested additionalContext tags", async () => {
    const customTemplate =
      "Custom template {{version}} {{#additionalContext}}outer{{#additionalContext}}inner{{/additionalContext}}{{/additionalContext}}";
    await generateNotes(
      {
        promptTemplate: customTemplate,
        additionalContext: mockAdditionalContext,
      },
      mockContext
    );
    expect(mockedQuery).toHaveBeenCalled();
    const promptArg = mockedQuery.mock.calls[0][0].prompt;
    expect(promptArg).toContain("Custom template 1.0.0");
    expect(promptArg).toContain("Additional context information");
  });

  it("should handle successful SDK response", async () => {
    mockedQuery.mockImplementationOnce(() => {
      return createMockQueryResponse("## Release Notes\n\nFinal");
    });

    const notes = await generateNotes({ cleanOutput: false, escaping: 'none' }, mockContext);
    expect(notes).toBe("## Release Notes\n\nFinal");
  });
});

describe("extractReleaseNotes", () => {
  const version = "1.2.3";

  it("should extract notes starting with version header", () => {
    const input = `Now I'll analyze the commits and create the release notes.
    
## ${version} (2023-05-15)

### Features
- Feature 1
- Feature 2

### Bug Fixes
- Fix 1`;
    const result = extractReleaseNotes(input, version);
    expect(result).toBe(`## ${version} (2023-05-15)

### Features
- Feature 1
- Feature 2

### Bug Fixes
- Fix 1`);
  });

  it("should handle version with date format", () => {
    const input = `Let me analyze these commits for you.
    
## ${version} (2023-05-15)

### Features
- Feature 1`;
    const result = extractReleaseNotes(input, version);
    expect(result).toBe(`## ${version} (2023-05-15)

### Features
- Feature 1`);
  });

  it("should find any markdown h2 header if exact version not found", () => {
    const input = `I'll generate release notes based on these commits.
    
## Release Notes (${version})

### Features
- Feature 1`;
    const result = extractReleaseNotes(input, version);
    expect(result).toBe(`## Release Notes (${version})

### Features
- Feature 1`);
  });

  it("should return original text if no headers found", () => {
    const input = `No headers in this text.
Just some random content without markdown headers.`;
    const result = extractReleaseNotes(input, version);
    expect(result).toBe(input);
  });

  it("should handle version strings with special regex characters", () => {
    const specialVersion = "1.0.0\\beta";
    const input = `Here's some preamble text.
    
## ${specialVersion} (2023-05-15)

### Features
- Feature 1`;
    const result = extractReleaseNotes(input, specialVersion);
    expect(result).toBe(`## ${specialVersion} (2023-05-15)

### Features
- Feature 1`);
  });
});

describe("cleanOutput option", () => {
  const mockContext: any = {
    logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
    nextRelease: { version: "1.0.0" },
    options: { repositoryUrl: "https://github.com/user/repo.git" },
  };

  const mockAdditionalContext = {
    pullRequests: [
      { number: 123, title: "Add new feature", url: "https://github.com/user/repo/pull/123" }
    ],
    issues: [
      { number: 456, title: "Bug in feature", url: "https://github.com/user/repo/issues/456" }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCommits as jest.Mock).mockResolvedValue([
      {
        message: "feat: add new feature",
        hash: "abc1234",
        committer: { name: "Developer 1" },
        committerDate: "2023-01-01",
      },
    ]);
    setDefaultQueryImplementation();
  });

  it("should use cleanOutput by default", async () => {
    const preambleContent = `Now I'll analyze these commits and generate release notes.

## 1.0.0 (2023-05-15)

### Features
- Added new feature X`;
    mockedQuery.mockImplementationOnce(() => {
      return createMockQueryResponse(preambleContent);
    });
    const result = await generateNotes({}, mockContext);
    expect(mockContext.logger.log).toHaveBeenCalledWith(
      "Cleaned release notes to remove any AI preamble"
    );
    expect(result).not.toContain("Now I'll analyze");
  });

  it("should skip cleaning when cleanOutput is false", async () => {
    const preambleContent = `Now I'll analyze these commits and generate release notes.

## 1.0.0 (2023-05-15)

### Features
- Added new feature X`;
    mockedQuery.mockImplementationOnce(() => {
      return createMockQueryResponse(preambleContent);
    });
    const result = await generateNotes({ cleanOutput: false, escaping: 'none' }, mockContext);
    expect(mockContext.logger.log).toHaveBeenCalledWith(
      "Skipping output cleaning (disabled by configuration)"
    );
    expect(result).toContain("Now I'll analyze");
  });

  describe("custom prompt template validation", () => {
    it("should warn if custom template is missing {{commits}} placeholder", async () => {
      const customTemplate = "Generate release notes for my project";
      await generateNotes(
        { promptTemplate: customTemplate, escaping: 'none' },
        mockContext
      );
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("missing {{commits}} placeholder")
      );
    });

    it("should log info about missing optional placeholders", async () => {
      const customTemplate = "Generate notes for {{commits}}";
      await generateNotes(
        { promptTemplate: customTemplate, escaping: 'none' },
        mockContext
      );
      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining("missing optional placeholders: {{version}}, {{date}}, {{repoName}}")
      );
    });

    it("should warn about missing additionalContext block when context is provided", async () => {
      const customTemplate = "Generate notes for {{version}} with {{commits}}";
      await generateNotes(
        { 
          promptTemplate: customTemplate, 
          additionalContext: mockAdditionalContext,
          escaping: 'none' 
        },
        mockContext
      );
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("missing {{#additionalContext}}...{{/additionalContext}} block")
      );
    });

    it("should not warn when all placeholders are present", async () => {
      const customTemplate = `Generate notes for {{repoName}} {{version}} ({{date}})
{{commits}}
{{#additionalContext}}Context: {{additionalContext}}{{/additionalContext}}`;
      
      // Clear previous mock calls
      mockContext.logger.warn.mockClear();
      mockContext.logger.log.mockClear();
      
      await generateNotes(
        { 
          promptTemplate: customTemplate,
          additionalContext: mockAdditionalContext,
          escaping: 'none'
        },
        mockContext
      );
      
      // Should not have any warnings about missing placeholders
      expect(mockContext.logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("missing {{commits}} placeholder")
      );
      expect(mockContext.logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("missing {{#additionalContext}}")
      );
      // The info log about optional placeholders should also not appear
      expect(mockContext.logger.log).not.toHaveBeenCalledWith(
        expect.stringContaining("missing optional placeholders")
      );
    });

    it("should not validate when using default template", async () => {
      // Clear previous mock calls
      mockContext.logger.warn.mockClear();
      
      await generateNotes({ escaping: 'none' }, mockContext);
      
      // Should not have any warnings since we're using the default template
      expect(mockContext.logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("missing {{commits}} placeholder")
      );
    });
  });

  describe("shell escaping", () => {
    it("should apply shell escaping by default", async () => {
      const releaseNotesWithQuotes = `## 1.0.0

### Features
- Fixed tests that weren't running
- Added "config" option
- Support for \`npm install\``;

      mockedQuery.mockImplementationOnce(() => {
        return createMockQueryResponse(releaseNotesWithQuotes);
      });

      const result = await generateNotes({}, mockContext);
      expect(mockContext.logger.log).toHaveBeenCalledWith(
        "Applied shell escaping to release notes"
      );
      // Check that the result is properly quoted by shescape
      // Shescape wraps the entire output in single quotes and escapes internal single quotes
      expect(result).toBe(`'## 1.0.0

### Features
- Fixed tests that weren'\\''t running
- Added "config" option
- Support for \`npm install\`'`);
    });

    it("should not escape when escaping is set to 'none'", async () => {
      const releaseNotesWithQuotes = `## 1.0.0

### Features
- Fixed tests that weren't running
- Added "config" option
- Support for \`npm install\``;

      mockedQuery.mockImplementationOnce(() => {
        return createMockQueryResponse(releaseNotesWithQuotes);
      });

      const result = await generateNotes({ escaping: 'none' }, mockContext);
      expect(mockContext.logger.log).not.toHaveBeenCalledWith(
        "Applied shell escaping to release notes"
      );
      // Check that special characters are NOT escaped
      expect(result).toContain("weren't");
      expect(result).toContain('"config"');
      expect(result).toContain('`npm install`');
      expect(result).not.toContain("'\\''");
      expect(result).not.toContain('\\"');
      expect(result).not.toContain('\\`');
    });

    it("should escape complex shell characters", async () => {
      const releaseNotesWithComplexChars = `## 1.0.0

### Features
- Support for $HOME directory
- Fixed C:\\Users\\path issues
- Command: echo "Hello \${WORLD}"`;

      mockedQuery.mockImplementationOnce(() => {
        return createMockQueryResponse(releaseNotesWithComplexChars);
      });

      const result = await generateNotes({}, mockContext);
      // Shescape wraps in single quotes, so special chars don't need escaping inside
      expect(result).toBe(`'## 1.0.0

### Features
- Support for $HOME directory
- Fixed C:\\Users\\path issues
- Command: echo "Hello \${WORLD}"'`);
    });

    it("should combine cleaning and escaping correctly", async () => {
      const preambleContent = `Now I'll analyze these commits.

## 1.0.0

### Features
- Fixed things that weren't working`;

      mockedQuery.mockImplementationOnce(() => {
        return createMockQueryResponse(preambleContent);
      });

      const result = await generateNotes({ cleanOutput: true }, mockContext);
      // Should be both cleaned and escaped
      expect(result).not.toContain("Now I'll analyze");
      // The cleaned result should be wrapped in quotes with escaped single quote
      expect(result).toBe(`'## 1.0.0

### Features
- Fixed things that weren'\\''t working'`);
    });
  });
});
