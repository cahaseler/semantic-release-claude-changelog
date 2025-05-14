const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Get the API key from environment variable
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY environment variable is not set. Please provide a valid API key.');
  process.exit(1);
}

// Run the test
async function runTest() {
  try {
    console.log('Starting semantic-release with Claude Code changelog plugin...');
    
    // Get commits from git - we're already in the demo repo directory within Docker
    // so we can just use git commands directly
    try {
      // Get commit history
      const gitCmd = `git log --pretty=format:"%H||%s||%b||%cn||%ci" --no-merges v1.0.0..HEAD`;
      const gitLogOutput = execSync(gitCmd, { encoding: 'utf8' });
      
      // Parse commits
      const commits = gitLogOutput
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => {
          try {
            const [hash, message, body, committerName, committerDate] = line.split('||');
            return {
              hash,
              message,
              body,
              committer: {
                name: committerName
              },
              committerDate
            };
          } catch (e) {
            console.warn('Failed to parse commit:', line);
            return null;
          }
        })
        .filter(commit => commit !== null);
      
      console.log(`Found ${commits.length} commits since v1.0.0`);
      
      // Set up context for generateNotes
      const context = {
        logger: {
          log: console.log,
          error: console.error
        },
        commits,
        nextRelease: {
          version: '1.1.0',
          gitTag: 'v1.1.0'
        },
        options: {
          repositoryUrl: 'https://github.com/test/test.git'
        }
      };
      
      // Import and use our plugin directly
      // In Docker, we need to use the path in /plugin
      const { generateNotes } = require('/plugin/lib/generate-notes');
      
      // Run generateNotes with streaming output
      console.log('Calling Claude to generate release notes with streaming output...');
      
      // Set up a mock logger that writes to console in real-time
      context.logger = {
        log: (...args) => {
          console.log('[LOG]', ...args);
        },
        error: (...args) => {
          console.error('[ERROR]', ...args);
        }
      };
      
      // Add a timeout to ensure the test doesn't run indefinitely
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Test timeout after 60 seconds'));
        }, 60000); // 60 second timeout
      });
      
      // Race the generateNotes call with the timeout
      const notes = await Promise.race([
        generateNotes({}, context),
        timeoutPromise
      ]);
      
      if (notes && notes.length > 0) {
        // Print the generated notes
        console.log('====================');
        console.log('GENERATED RELEASE NOTES:');
        console.log('====================');
        console.log(notes);
        console.log('====================');
        
        // Write notes to a file for inspection
        fs.writeFileSync('/test/generated-notes.md', notes);
        console.log('Notes saved to /test/generated-notes.md');
        
        console.log('\n✅ TEST PASSED: Release notes were successfully generated');
        return 0;
      } else {
        console.log('\n❌ TEST FAILED: No release notes were generated');
        return 1;
      }
    } catch (error) {
      console.error('Error with git or generating notes:', error);
      return 1;
    }
  } catch (error) {
    console.error('Error during test:', error);
    return 1;
  }
}

runTest()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });