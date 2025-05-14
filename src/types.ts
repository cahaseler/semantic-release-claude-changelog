// Define our own Context type for semantic-release
export interface Context {
  logger: {
    log: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
  };
  nextRelease?: {
    version: string;
    gitTag?: string;
    notes?: string;
  };
  options?: {
    repositoryUrl?: string;
    [key: string]: any;
  };
  commits?: any[];
  [key: string]: any;
}

/**
 * Plugin configuration options
 */
export interface PluginConfig {
  /**
   * Path to the Claude Code CLI executable
   * @default 'claude'
   */
  claudePath?: string;
  
  /**
   * Template for the prompt sent to Claude
   */
  promptTemplate?: string;
  
  /**
   * Maximum number of commits to include in the prompt
   * @default 100
   */
  maxCommits?: number;
}