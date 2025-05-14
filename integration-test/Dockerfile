FROM node:18

# Install git and other dependencies
RUN apt-get update && apt-get install -y git bash curl

# Install Claude CLI
RUN npm install -g @anthropic-ai/claude-code

# Set working directory for the plugin
WORKDIR /plugin

# Copy the built plugin files
COPY plugin /plugin

# Install dependencies
RUN npm install --only=production

# Set up test environment
WORKDIR /test

# Copy integration test files
COPY test /test

# Make scripts executable
RUN chmod +x /test/test-setup.sh

# Install semantic-release in the demo repo
WORKDIR /test/demo-repo
RUN npm install --save-dev semantic-release

# Install our plugin
RUN npm install --save-dev /plugin
 
ENTRYPOINT ["/test/test-setup.sh"]