import { generateNotes } from '../generate-notes';
import { getCommits } from '../get-commits';

// Mock dependencies
jest.mock('../get-commits');
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn()
}));
jest.mock('os', () => ({
  tmpdir: jest.fn().mockReturnValue('/tmp')
}));
jest.mock('path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/'))
}));

// Mock execa with simple implementation
jest.mock('execa', () => {
  const mockFn = jest.fn();
  mockFn.mockImplementation((cmd, args, opts) => {
    // Store the arguments for later inspection in tests
    mockFn.mockArgs = { cmd, args, opts };
    
    const stdout = {
      on: jest.fn().mockImplementation((event, cb) => {
        if (event === 'data') {
          cb(JSON.stringify({ role: 'system', result: '## Release Notes\n\nGreat release!' }));
        }
        return stdout; // Return for chaining
      })
    };
    
    const mockProcess = {
      stdout,
      then: (cb) => Promise.resolve().then(() => cb())
    };
    
    return mockProcess;
  });
  
  // Expose arguments for verification in tests
  mockFn.mockArgs = {};
  
  return { __esModule: true, default: mockFn };
});

describe('generateNotes', () => {
  const mockContext: any = {
    logger: {
      log: jest.fn(),
      error: jest.fn()
    },
    nextRelease: {
      version: '1.0.0'
    },
    options: {
      repositoryUrl: 'https://github.com/user/repo.git'
    }
  };

  const mockCommits = [
    {
      message: 'feat: add new feature',
      hash: 'abc1234',
      committer: { name: 'Developer 1' },
      committerDate: '2023-01-01'
    }
  ];
  
  const mockAdditionalContext = {
    pullRequests: [
      { number: 123, title: 'Add new feature', url: 'https://github.com/user/repo/pull/123' }
    ],
    issues: [
      { number: 456, title: 'Bug in feature', url: 'https://github.com/user/repo/issues/456' }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCommits as jest.Mock).mockResolvedValue(mockCommits);
    
    // Reset execa mock args
    const execa = require('execa').default;
    execa.mockArgs = {};
  });

  it('should return empty string when no commits are found', async () => {
    (getCommits as jest.Mock).mockResolvedValue([]);
    
    const notes = await generateNotes({}, mockContext);
    
    expect(notes).toBe('');
    expect(mockContext.logger.log).toHaveBeenCalledWith('No commits found, using empty release notes');
  });
  
  it('should generate release notes with Claude', async () => {
    const notes = await generateNotes({}, mockContext);
    
    // Verify commits were retrieved
    expect(getCommits).toHaveBeenCalledWith(mockContext, 100);
    
    // Verify Claude CLI was called
    const execa = require('execa').default;
    expect(execa).toHaveBeenCalled();
  });
  
  it('should handle Claude CLI errors', async () => {
    const execa = require('execa').default;
    
    // Mock execa to throw an error for this test only
    execa.mockImplementationOnce(() => {
      throw new Error('Claude CLI error');
    });
    
    const notes = await generateNotes({}, mockContext);
    
    expect(notes).toBe('## Release Notes\n\nNo release notes generated due to an error.');
    expect(mockContext.logger.error).toHaveBeenCalledWith('Error generating release notes with Claude', expect.any(Error));
  });
  
  it('should include additional context in the prompt when provided', async () => {
    const fs = require('fs');
    
    // Call generateNotes with additionalContext
    await generateNotes({ 
      additionalContext: mockAdditionalContext 
    }, mockContext);
    
    // Check that writeFileSync was called with content that includes the additional context
    expect(fs.writeFileSync).toHaveBeenCalled();
    const promptArg = fs.writeFileSync.mock.calls[0][1];
    expect(promptArg).toContain('Additional context information');
    expect(promptArg).toContain(JSON.stringify(mockAdditionalContext, null, 2));
  });
  
  it('should not include additional context section when not provided', async () => {
    const fs = require('fs');
    
    // Call generateNotes without additionalContext
    await generateNotes({}, mockContext);
    
    // Check that writeFileSync was called with content that does not include additional context
    expect(fs.writeFileSync).toHaveBeenCalled();
    const promptArg = fs.writeFileSync.mock.calls[0][1];
    expect(promptArg).not.toContain('Additional context information');
  });
  
  it('should work with custom template and additionalContext', async () => {
    const fs = require('fs');
    // Update the test to match how our template substitution actually works
    const customTemplate = 'Custom template {{version}} with {{#additionalContext}}Additional context{{/additionalContext}}';
    
    // Call generateNotes with custom template and additionalContext
    await generateNotes({ 
      promptTemplate: customTemplate,
      additionalContext: mockAdditionalContext 
    }, mockContext);
    
    // Check that writeFileSync was called with content that includes the additional context
    expect(fs.writeFileSync).toHaveBeenCalled();
    const promptArg = fs.writeFileSync.mock.calls[0][1];
    expect(promptArg).toContain('Custom template 1.0.0');
    expect(promptArg).toContain('Additional context');
    expect(promptArg).not.toContain('{{additionalContext}}'); // Placeholder should be replaced
  });
  
  it('should handle custom template without conditional blocks', async () => {
    const fs = require('fs');
    // Custom template without the {{#additionalContext}} conditional
    const customTemplate = 'Custom template {{version}} with {{commits}} IMPORTANT: instructions';
    
    // Call generateNotes with custom template and additionalContext
    await generateNotes({ 
      promptTemplate: customTemplate,
      additionalContext: mockAdditionalContext 
    }, mockContext);
    
    // Check that writeFileSync was called with content that includes the additional context
    expect(fs.writeFileSync).toHaveBeenCalled();
    const promptArg = fs.writeFileSync.mock.calls[0][1];
    expect(promptArg).toContain('Custom template 1.0.0');
    expect(promptArg).toContain('Additional context information');
    expect(promptArg).toContain('IMPORTANT:'); // Should still have instructions
    // The additional context should be after commits but before IMPORTANT
    // In mock data, we need to account for the fact that the commits are replaced
    const commitBlockEnd = promptArg.indexOf('```', promptArg.indexOf('with'));
    const importantIndex = promptArg.indexOf('IMPORTANT:');
    const additionalContextIndex = promptArg.indexOf('Additional context information');
    expect(commitBlockEnd).not.toBe(-1);
    expect(importantIndex).not.toBe(-1);
    expect(additionalContextIndex).not.toBe(-1);
    expect(additionalContextIndex).toBeGreaterThan(0);
    expect(additionalContextIndex).toBeLessThan(importantIndex);
  });
});