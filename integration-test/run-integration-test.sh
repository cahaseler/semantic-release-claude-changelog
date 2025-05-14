#!/bin/bash
set -e

# Change to the project root directory
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

# Check if .env file exists
if [ ! -f .env ]; then
  echo "Error: .env file not found at project root. Please create one with ANTHROPIC_API_KEY."
  exit 1
fi

# Build the package first
echo "Building the package..."
npm run build

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
echo "Using temporary directory: $TEMP_DIR"

# Create a test package structure
mkdir -p $TEMP_DIR/plugin
cp -r lib $TEMP_DIR/plugin/
cp package.json $TEMP_DIR/plugin/

# Copy integration test files
mkdir -p $TEMP_DIR/test
cp -r integration-test/test-setup.sh integration-test/run-test.js $TEMP_DIR/test/
cp -r integration-test/demo-repo $TEMP_DIR/test/

# Copy the Dockerfile
cp integration-test/Dockerfile $TEMP_DIR/

# Change to the temporary directory
cd $TEMP_DIR

# Build the Docker image
echo "Building Docker integration test image..."
docker build -t semantic-release-claude-test .

# Run the tests with the API key from .env
echo "Running integration test..."
docker run --rm \
  --env-file $PROJECT_ROOT/.env \
  semantic-release-claude-test

EXIT_CODE=$?

# Clean up temporary directory
rm -rf $TEMP_DIR

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Integration test passed!"
else
  echo "❌ Integration test failed!"
fi

exit $EXIT_CODE