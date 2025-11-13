// Mock the Claude Agent SDK
jest.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: jest.fn(),
}));

import indexDefault from '../index';

describe('index', () => {
  it('should export the generateNotes function', () => {
    expect(indexDefault.generateNotes).toBeDefined();
    expect(typeof indexDefault.generateNotes).toBe('function');
  });
});