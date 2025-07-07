import { generateNotes, extractReleaseNotes } from "../generate-notes";
import { getCommits } from "../get-commits";
import fs from "fs";
import execa, { Options, ExecaChildProcess, ExecaReturnValue } from "execa";
import { Readable } from "stream";
import { ChildProcess } from "child_process";

// Mock dependencies
jest.mock("../get-commits");
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));
jest.mock("os", () => ({
  tmpdir: jest.fn().mockReturnValue("/tmp"),
}));

jest.mock("path", () => ({
  join: jest.fn().mockImplementation((...args: string[]) => args.join("/")),
}));

jest.mock("execa", () => jest.fn());

type CustomMockedExecaType = jest.MockedFunction<typeof execa> & {
  mockArgs?: {
    cmd: string;
    args?: readonly string[];
    opts?: Options | Options<null>;
  }; // Allow Options<null> for opts in mockArgs
};

const mockedExeca = execa as CustomMockedExecaType;

const createMockProcess = (
  stdoutContent: string | Buffer,
  exitCode = 0
): ExecaChildProcess<Buffer> => {
  const stdoutBuffer = Buffer.isBuffer(stdoutContent)
    ? stdoutContent
    : Buffer.from(stdoutContent);

  class MockReadable extends Readable {
    private content: Buffer;
    private delivered = false;
    constructor(content: Buffer, options?: import("stream").ReadableOptions) {
      super(options);
      this.content = content;
    }
    _read(_size: number) {
      if (!this.delivered) {
        this.push(this.content);
        this.delivered = true;
      }
      this.push(null);
    }
  }

  const stdoutStream = new MockReadable(stdoutBuffer);
  const stderrStream = new MockReadable(Buffer.from(""));

  const childProcessProperties: Partial<ChildProcess> = {
    stdout: stdoutStream as any,
    stderr: stderrStream as any,
    stdin: null,
    pid: 12345,
    connected: false,
    exitCode: exitCode,
    signalCode: null,
    killed: false,
    spawnargs: [],
    spawnfile: "",
    stdio: [null, stdoutStream, stderrStream, null, null] as any,
    kill: jest.fn(),
    disconnect: jest.fn(),
    ref: jest.fn(),
    unref: jest.fn(),
    send: jest.fn(),
    addListener: jest.fn(),
    emit: jest.fn(),
    eventNames: jest.fn(),
    getMaxListeners: jest.fn(),
    listenerCount: jest.fn(),
    listeners: jest.fn(),
    off: jest.fn(),
    on: jest
      .fn()
      .mockImplementation((event: string, cb: (...args: any[]) => void) => {
        if (event === "end" || event === "close" || event === "exit") {
          // Ensure promise resolves on stream/process end
          Promise.resolve().then(() => {
            if (event === "close" || event === "exit") cb(exitCode, null);
            else cb(); // For 'end'
          });
        }
        return childProcessProperties as any;
      }),
    once: jest.fn(),
    prependListener: jest.fn(),
    prependOnceListener: jest.fn(),
    rawListeners: jest.fn(),
    removeAllListeners: jest.fn(),
    removeListener: jest.fn(),
    setMaxListeners: jest.fn(),
    [Symbol.dispose]: jest.fn(),
  };

  // This promise should resolve when the stream ends or the process closes.
  const promisePart = new Promise<ExecaReturnValue<Buffer>>(
    (resolve, reject) => {
      const returnValue: ExecaReturnValue<Buffer> = {
        command: "mockCmd",
        escapedCommand: "mockCmd",
        exitCode: exitCode,
        stdout: stdoutBuffer,
        stderr: Buffer.from(""),
        all: stdoutBuffer,
        failed: exitCode !== 0,
        timedOut: false,
        isCanceled: false,
        isTerminated: false,
        killed: false,
        originalMessage: "",
        shortMessage: "",
        signal: undefined,
        signalDescription: undefined,
        stdio: [stdoutBuffer, Buffer.from("")],
      };

      let streamEnded = false;
      let processClosed = false;

      const tryResolve = () => {
        // Ensure both stream has ended (implicitly via _read pushing null)
        // and process has 'closed' before resolving the main promise.
        // For simplicity in mock, we might tie it more directly to 'end' or 'close' of the stream part.
        if (streamEnded && processClosed) {
          // Or just one of them if sufficient
          resolve(returnValue);
        }
      };

      // Simulate stream 'end' more reliably for the promise
      (childProcessProperties.stdout as MockReadable).on("end", () => {
        streamEnded = true;
        tryResolve();
      });
      (childProcessProperties.stderr as MockReadable).on("end", () => {
        // Handle stderr end if necessary
      });

      // Simulate process 'close' for the promise
      (childProcessProperties as ChildProcess).on("close", () => {
        // Use the 'on' we defined
        processClosed = true;
        tryResolve();
      });
      (childProcessProperties as ChildProcess).on("exit", () => {
        // Also listen to exit
        processClosed = true; // Consider exit as a form of close for promise resolution
        tryResolve();
      });

      // Fallback: If the stream is simple and synchronous, resolve quickly.
      // This is tricky; real execa handles this internally.
      // Forcing a resolve for the test if 'end' isn't hit quickly enough by the mock.
      // This might be needed if the 'data' event in generateNotes is the only thing driving it.
      // However, the MockReadable should emit 'end' after pushing its content.
      if (
        stdoutBuffer.length === 0 ||
        (stdoutStream as MockReadable)["_readableState"]?.ended
      ) {
        streamEnded = true; // Assume ended if empty or state says so
      }
      // If we assume the process 'close' event on the mock is reliable:
      // (childProcessProperties as ChildProcess).on('close', () => resolve(returnValue));
      // For now, let's make the promise resolve after a short delay to allow 'data' events to fire.
      // This is a common workaround for testing streams when exact timing is hard to mock.
      // setTimeout(() => resolve(returnValue), 0);
      // A better way: the 'on' handler for 'close'/'exit' on childProcessProperties should trigger resolve.
      // The 'end' event on the stream itself is also key.
      // Let's ensure the 'on' mock for 'close'/'exit' on childProcessProperties resolves the promise.
      const originalOn = childProcessProperties.on;
      childProcessProperties.on = jest
        .fn()
        .mockImplementation((event: string, cb: (...args: any[]) => void) => {
          if (event === "close" || event === "exit") {
            Promise.resolve().then(() => {
              cb(exitCode, null);
              resolve(returnValue); // Resolve the main promise here
            });
          } else if (
            event === "data" &&
            stdoutStream === childProcessProperties.stdout
          ) {
            // cb will be called by MockReadable's push if listener is attached
          } else if (
            event === "end" &&
            stdoutStream === childProcessProperties.stdout
          ) {
            Promise.resolve().then(() => {
              cb();
              // streamEnded = true; // Redundant if close/exit resolves
              // tryResolve();
            });
          }
          return childProcessProperties as any;
        });
      // If no 'close' or 'exit' listener is attached by the code under test, this promise might not resolve.
      // Execa's promise *does* resolve. So, we need to ensure this mock's promise resolves.
      // Forcing resolution for the sake of the mock if not otherwise triggered by 'close' or 'exit' being listened to.
      // This is a common challenge in deeply mocking execa.
      // A simple approach for the mock: resolve after a tick to allow data events.
      if (!returnValue.failed) {
        // Only auto-resolve if not a failed exit code
        setTimeout(() => resolve(returnValue), 0);
      } else {
        setTimeout(
          () => reject(new Error(`Mock process exited with code ${exitCode}`)),
          0
        );
      }
    }
  );

  const execaChildProcessMock = Object.assign(
    Object.create(Promise.prototype),
    childProcessProperties,
    {
      then: promisePart.then.bind(promisePart),
      catch: promisePart.catch.bind(promisePart),
      finally: promisePart.finally.bind(promisePart),
    }
  );

  return execaChildProcessMock as ExecaChildProcess<Buffer>;
};

const setDefaultExecaImplementation = () => {
  mockedExeca.mockImplementation(
    (
      cmd: string,
      arg1?: readonly string[] | Options | Options<null>,
      arg2?: Options | Options<null>
    ): ExecaChildProcess<Buffer> => {
      let execArgs: readonly string[] | undefined;
      let execOpts: Options | Options<null> | undefined;

      if (Array.isArray(arg1)) {
        execArgs = arg1;
        execOpts = arg2;
      } else {
        execArgs = undefined;
        execOpts = arg1 as Options | Options<null> | undefined;
      }

      mockedExeca.mockArgs = { cmd, args: execArgs, opts: execOpts as Options };

      const defaultResult = Buffer.from(
        JSON.stringify({
          type: "result",
          subtype: "success",
          result: "## Release Notes\n\nGreat release!",
          session_id: "mock-session-id",
          is_error: false,
        })
      );
      return createMockProcess(defaultResult);
    }
  );
  mockedExeca.mockArgs = { cmd: "", args: [], opts: {} };
};

setDefaultExecaImplementation();

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
    setDefaultExecaImplementation();
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
    expect(mockedExeca).toHaveBeenCalled();
  });

  it("should handle Claude CLI errors", async () => {
    mockedExeca.mockImplementationOnce(() => {
      throw new Error("Claude CLI error");
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
    expect(fs.writeFileSync).toHaveBeenCalled();
    const promptArg = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
    expect(promptArg).toContain("Additional context information");
    expect(promptArg).toContain(JSON.stringify(mockAdditionalContext, null, 2));
  });

  it("should not include additional context section when not provided", async () => {
    await generateNotes({}, mockContext);
    expect(fs.writeFileSync).toHaveBeenCalled();
    const promptArg = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
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
    expect(fs.writeFileSync).toHaveBeenCalled();
    const promptArg = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
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
    expect(fs.writeFileSync).toHaveBeenCalled();
    const promptArg = (fs.writeFileSync as jest.Mock).mock
      .calls[0][1] as string;
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
    expect(fs.writeFileSync).toHaveBeenCalled();
    const promptArg = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
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
    expect(fs.writeFileSync).toHaveBeenCalled();
    const promptArg = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
    expect(promptArg).toContain("Custom template 1.0.0");
    expect(promptArg).toContain("Additional context information");
  });

  it("should use the last valid JSON message when output contains invalid lines", async () => {
    mockedExeca.mockImplementationOnce((): ExecaChildProcess<Buffer> => {
      const multiLineOutput =
        "not-json\n" +
        JSON.stringify({
          type: "assistant",
          message: {
            id: "msg1",
            type: "message",
            role: "assistant",
            model: "claude-mock",
            content: [{ type: "text", text: "First assistant message." }],
            stop_reason: "tool_use",
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          },
          session_id: "test-session",
        }) +
        "\n" +
        "broken {\n" +
        JSON.stringify({
          type: "result",
          subtype: "success",
          result: "## Release Notes\n\nFinal",
          session_id: "test-session",
          is_error: false,
          cost_usd: 0.01,
          duration_ms: 1000,
        }) +
        "\n";
      return createMockProcess(Buffer.from(multiLineOutput));
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
    setDefaultExecaImplementation();
  });

  it("should use cleanOutput by default", async () => {
    const preambleContent = `Now I'll analyze these commits and generate release notes.
              
## 1.0.0 (2023-05-15)

### Features
- Added new feature X`;
    mockedExeca.mockImplementationOnce((): ExecaChildProcess<Buffer> => {
      const resultBuffer = Buffer.from(
        JSON.stringify({
          type: "result",
          subtype: "success",
          result: preambleContent,
          session_id: "test-session-preamble",
          is_error: false,
        })
      );
      return createMockProcess(resultBuffer);
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
    mockedExeca.mockImplementationOnce((): ExecaChildProcess<Buffer> => {
      const resultBuffer = Buffer.from(
        JSON.stringify({
          type: "result",
          subtype: "success",
          result: preambleContent,
          session_id: "test-session-no-clean",
          is_error: false,
        })
      );
      return createMockProcess(resultBuffer);
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

      mockedExeca.mockImplementationOnce((): ExecaChildProcess<Buffer> => {
        const resultBuffer = Buffer.from(
          JSON.stringify({
            type: "result",
            subtype: "success",
            result: releaseNotesWithQuotes,
            session_id: "test-session-escaping",
            is_error: false,
          })
        );
        return createMockProcess(resultBuffer);
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

      mockedExeca.mockImplementationOnce((): ExecaChildProcess<Buffer> => {
        const resultBuffer = Buffer.from(
          JSON.stringify({
            type: "result",
            subtype: "success",
            result: releaseNotesWithQuotes,
            session_id: "test-session-no-escaping",
            is_error: false,
          })
        );
        return createMockProcess(resultBuffer);
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

      mockedExeca.mockImplementationOnce((): ExecaChildProcess<Buffer> => {
        const resultBuffer = Buffer.from(
          JSON.stringify({
            type: "result",
            subtype: "success",
            result: releaseNotesWithComplexChars,
            session_id: "test-session-complex",
            is_error: false,
          })
        );
        return createMockProcess(resultBuffer);
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

      mockedExeca.mockImplementationOnce((): ExecaChildProcess<Buffer> => {
        const resultBuffer = Buffer.from(
          JSON.stringify({
            type: "result",
            subtype: "success",
            result: preambleContent,
            session_id: "test-session-clean-escape",
            is_error: false,
          })
        );
        return createMockProcess(resultBuffer);
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
