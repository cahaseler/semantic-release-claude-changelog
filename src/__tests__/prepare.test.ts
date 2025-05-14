import { prepare } from '../prepare';

// Mock dependencies
jest.mock('execa', () => {
  const mockExeca = jest.fn();
  return {
    __esModule: true,
    default: mockExeca,
    execa: mockExeca
  };
});

describe('prepare', () => {
  const mockContext: any = {
    logger: {
      log: jest.fn(),
      error: jest.fn()
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('should install and verify Claude CLI successfully', async () => {
    const execa = require('execa').default;
    
    // Mock npm install
    execa.mockResolvedValueOnce({
      stdout: 'Successfully installed'
    });
    
    // Mock version check
    execa.mockResolvedValueOnce({
      stdout: 'Claude Code CLI v1.0.0'
    });

    await prepare({}, mockContext);

    // Verify npm install was called
    expect(execa).toHaveBeenCalledWith('npm', ['install', '-g', '@anthropic-ai/claude-code']);
    
    // Verify claude -v was called
    expect(execa).toHaveBeenCalledWith('claude', ['-v']);
    
    // Verify logging
    expect(mockContext.logger.log).toHaveBeenCalledWith('Installing Claude Code CLI...');
    expect(mockContext.logger.log).toHaveBeenCalledWith('Successfully installed Claude Code CLI');
    expect(mockContext.logger.log).toHaveBeenCalledWith('Verified Claude Code CLI: Claude Code CLI v1.0.0');
  });

  it('should try --version flag if -v fails', async () => {
    const execa = require('execa').default;
    
    // Mock npm install
    execa.mockResolvedValueOnce({
      stdout: 'Successfully installed'
    });
    
    // Mock -v failure
    execa.mockRejectedValueOnce(new Error('Unknown option'));
    
    // Mock --version success
    execa.mockResolvedValueOnce({
      stdout: 'Claude Code CLI v1.0.0'
    });

    await prepare({}, mockContext);

    // Verify both version commands were tried
    expect(execa).toHaveBeenCalledWith('claude', ['-v']);
    expect(execa).toHaveBeenCalledWith('claude', ['--version']);
    
    // Verify logging
    expect(mockContext.logger.log).toHaveBeenCalledWith('Verified Claude Code CLI: Claude Code CLI v1.0.0');
  });

  it('should throw error if installation fails', async () => {
    const execa = require('execa').default;
    
    // Mock npm install failure
    execa.mockRejectedValueOnce(new Error('Installation failed'));

    await expect(prepare({}, mockContext)).rejects.toThrow(
      'Unable to install Claude Code CLI. Please check your environment and network connectivity.'
    );

    expect(mockContext.logger.error).toHaveBeenCalledWith(
      'Failed to install or verify Claude Code CLI', 
      expect.any(Error)
    );
  });

  it('should throw error if verification fails', async () => {
    const execa = require('execa').default;
    
    // Mock npm install success
    execa.mockResolvedValueOnce({
      stdout: 'Successfully installed'
    });
    
    // Mock both version checks failing
    execa.mockRejectedValueOnce(new Error('Command not found'));
    execa.mockRejectedValueOnce(new Error('Command not found'));

    await expect(prepare({}, mockContext)).rejects.toThrow(
      'Unable to install Claude Code CLI. Please check your environment and network connectivity.'
    );
  });

  it('should warn if ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    
    const execa = require('execa').default;
    
    // Mock successful commands
    execa.mockResolvedValueOnce({
      stdout: 'Successfully installed'
    });
    
    execa.mockResolvedValueOnce({
      stdout: 'Claude Code CLI v1.0.0'
    });

    await prepare({}, mockContext);

    expect(mockContext.logger.log).toHaveBeenCalledWith('Warning: ANTHROPIC_API_KEY environment variable is not set.');
    expect(mockContext.logger.log).toHaveBeenCalledWith('Make sure the API key is available when running Claude Code CLI.');
  });

  it('should use custom Claude CLI path', async () => {
    const customPath = '/custom/path/to/claude';
    
    const execa = require('execa').default;
    
    // Mock successful commands
    execa.mockResolvedValueOnce({
      stdout: 'Successfully installed'
    });
    
    execa.mockResolvedValueOnce({
      stdout: 'Claude Code CLI v1.0.0'
    });

    await prepare({ claudePath: customPath }, mockContext);

    expect(execa).toHaveBeenCalledWith(customPath, ['-v']);
  });
});