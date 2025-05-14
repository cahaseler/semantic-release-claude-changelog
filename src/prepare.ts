import { Context, PluginConfig } from './types';
import execa from 'execa';

/**
 * Prepare step for the plugin
 * Installs Claude Code CLI and checks for API key
 */
export async function prepare(
  pluginConfig: PluginConfig,
  context: Context
): Promise<void> {
  const { logger } = context;
  const { claudePath = 'claude' } = pluginConfig;

  // Check if ANTHROPIC_API_KEY environment variable is set
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.log('Warning: ANTHROPIC_API_KEY environment variable is not set.');
    logger.log('Make sure the API key is available when running Claude Code CLI.');
  } else {
    logger.log('ANTHROPIC_API_KEY environment variable is set.');
  }

  logger.log('Installing Claude Code CLI...');
  
  try {
    // Install Claude Code CLI globally
    await execa('npm', ['install', '-g', '@anthropic-ai/claude-code']);
    logger.log('Successfully installed Claude Code CLI');
    
    // Verify the installation
    try {
      const { stdout } = await execa(claudePath, ['-v']);
      logger.log(`Verified Claude Code CLI: ${stdout}`);
    } catch (verifyError) {
      // Try with --version as fallback
      try {
        const { stdout } = await execa(claudePath, ['--version']);
        logger.log(`Verified Claude Code CLI: ${stdout}`);
      } catch (fallbackError) {
        throw new Error('Failed to verify Claude Code CLI installation');
      }
    }
  } catch (error) {
    logger.error('Failed to install or verify Claude Code CLI', error);
    throw new Error(
      'Unable to install Claude Code CLI. Please check your environment and network connectivity.'
    );
  }
}