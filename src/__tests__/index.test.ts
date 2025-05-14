import * as index from '../index';

describe('index', () => {
  it('should export prepare and generateNotes functions', () => {
    expect(index.prepare).toBeDefined();
    expect(index.generateNotes).toBeDefined();
    expect(typeof index.prepare).toBe('function');
    expect(typeof index.generateNotes).toBe('function');
  });
});