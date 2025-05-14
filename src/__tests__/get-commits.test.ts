import { getCommits } from '../get-commits';

describe('getCommits', () => {
  const mockCommits = [
    { hash: 'abc1234', message: 'feat: add new feature' },
    { hash: 'def5678', message: 'fix: fix critical bug' },
    { hash: 'ghi9012', message: 'docs: update readme' }
  ];

  const mockContext: any = {
    commits: [...mockCommits],
    logger: {
      log: jest.fn()
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return commits up to maxCommits', async () => {
    const result = await getCommits(mockContext, 2);
    
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(mockCommits[0]);
    expect(result[1]).toBe(mockCommits[1]);
    expect(mockContext.logger.log).toHaveBeenCalledWith('Found 2 commits');
  });

  it('should return all commits if maxCommits is greater than available commits', async () => {
    const result = await getCommits(mockContext, 10);
    
    expect(result).toHaveLength(3);
    expect(result).toEqual(mockCommits);
    expect(mockContext.logger.log).toHaveBeenCalledWith('Found 3 commits');
  });

  it('should return empty array if no commits are available', async () => {
    const emptyContext: any = {
      commits: [],
      logger: {
        log: jest.fn()
      }
    };
    
    const result = await getCommits(emptyContext, 10);
    
    expect(result).toEqual([]);
    expect(emptyContext.logger.log).toHaveBeenCalledWith('No commits found');
  });

  it('should handle undefined commits', async () => {
    const undefinedContext: any = {
      commits: undefined,
      logger: {
        log: jest.fn()
      }
    };
    
    const result = await getCommits(undefinedContext, 10);
    
    expect(result).toEqual([]);
    expect(undefinedContext.logger.log).toHaveBeenCalledWith('No commits found');
  });
});