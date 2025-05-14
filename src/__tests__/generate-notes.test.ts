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
  mockFn.mockImplementation(() => {
    const stdout = {
      on: jest.fn().mockImplementation((event, cb) => {
        if (event === 'data') {
          cb(JSON.stringify({ role: 'system', result: '## Release Notes\n\nGreat release!' }));
        }
      })
    };
    
    return {
      stdout,
      then: (cb) => Promise.resolve().then(() => cb())
    };
  });
  
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

  beforeEach(() => {
    jest.clearAllMocks();
    (getCommits as jest.Mock).mockResolvedValue(mockCommits);
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
});