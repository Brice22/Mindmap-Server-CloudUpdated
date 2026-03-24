import { validateNodeName } from './node-utils';

describe('Node Logic (TDD)', () => {
  it('should reject names shorter than 2 characters', () => {
    const result = validateNodeName('A');
    expect(result).toBe(false); // This will FAIL because the function doesn't exist
  });
});
