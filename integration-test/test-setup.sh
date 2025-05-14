#!/bin/bash
set -e

# Display test banner
echo "==============================================="
echo "Semantic Release Claude Changelog Integration Test"
echo "==============================================="

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is not set."
  exit 1
fi

# Initialize git repository
cd /test/demo-repo
git config --global user.email "test@example.com"
git config --global user.name "Test User"

# Initialize git repository if not already initialized
if [ ! -d ".git" ]; then
  git init
  
  # Stage and commit package.json and other files
  git add .
  git commit -m "chore: initial project setup"
  
  # Create an initial tag to test from
  git tag -a v1.0.0 -m "v1.0.0 - Initial release"
  
  # Make just a couple of commits for a faster test
  echo "function authenticateUser(email, password) {
  console.log('Authenticating user with email', email);
  return true; // Mock implementation
}" > auth.js
  git add auth.js
  git commit -m "feat(auth): implement basic user authentication
  
This change adds a basic authentication system with the following features:
- Email/password authentication
- Simple auth token generation
- User session management"

  echo "function login(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }
  
  // Continue with login process
  return authenticateUser(email, password);
}" >> auth.js
  git add auth.js
  git commit -m "fix(auth): add input validation to login function
  
Fixes a critical security issue where the login function wasn't properly validating inputs,
potentially allowing null values to be passed into the authentication system."
fi

# Verify Claude CLI installation
echo "Verifying Claude CLI installation..."
which claude || echo "Claude CLI not found"
claude --version || echo "Failed to get Claude version"

# Run the test using our plugin
echo "Running semantic-release with Claude changelog plugin..."
node /test/run-test.js