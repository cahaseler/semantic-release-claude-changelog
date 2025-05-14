import indexDefault from '../index';

describe('index', () => {
  it('should export the generateNotes function', () => {
    expect(indexDefault.generateNotes).toBeDefined();
    expect(typeof indexDefault.generateNotes).toBe('function');
  });
});