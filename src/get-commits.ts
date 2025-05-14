import { Context } from './types';

/**
 * Get commits between the last release and the current one
 */
export async function getCommits(
  context: Context,
  maxCommits: number
): Promise<any[]> {
  const { commits, logger } = context;
  
  if (!commits || commits.length === 0) {
    logger.log('No commits found');
    return [];
  }
  
  // Limit the number of commits if needed
  const limitedCommits = commits.slice(0, maxCommits);
  
  logger.log(`Found ${limitedCommits.length} commits`);
  return limitedCommits;
}