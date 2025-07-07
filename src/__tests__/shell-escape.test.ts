import { escapeForShell, escapeText } from '../shell-escape';

describe('shell-escape', () => {
  describe('escapeForShell', () => {
    it('should wrap strings in single quotes and escape single quotes', () => {
      expect(escapeForShell("can't")).toBe("'can'\\''t'");
      expect(escapeForShell("weren't")).toBe("'weren'\\''t'");
      expect(escapeForShell("it's")).toBe("'it'\\''s'");
    });

    it('should wrap strings containing double quotes', () => {
      expect(escapeForShell('He said "hello"')).toBe("'He said \"hello\"'");
      expect(escapeForShell('"quoted"')).toBe("'\"quoted\"'");
    });

    it('should wrap strings containing backslashes', () => {
      expect(escapeForShell('path\\to\\file')).toBe("'path\\to\\file'");
      expect(escapeForShell('line1\\nline2')).toBe("'line1\\nline2'");
    });

    it('should wrap strings containing dollar signs', () => {
      expect(escapeForShell('$variable')).toBe("'$variable'");
      expect(escapeForShell('${VAR}')).toBe("'${VAR}'");
      expect(escapeForShell('cost: $100')).toBe("'cost: $100'");
    });

    it('should wrap strings containing backticks', () => {
      expect(escapeForShell('`command`')).toBe("'`command`'");
      expect(escapeForShell('use `npm install`')).toBe("'use `npm install`'");
    });

    it('should handle multiple special characters', () => {
      expect(escapeForShell("can't use \"$HOME\" or `pwd`")).toBe(
        "'can'\\''t use \"$HOME\" or `pwd`'"
      );
    });

    it('should handle empty strings', () => {
      expect(escapeForShell('')).toBe("''");
    });

    it('should wrap strings with no special characters', () => {
      expect(escapeForShell('hello world')).toBe("'hello world'");
      expect(escapeForShell('version 1.2.3')).toBe("'version 1.2.3'");
    });

    it('should preserve newlines within quotes', () => {
      expect(escapeForShell('line1\nline2\nline3')).toBe("'line1\nline2\nline3'");
    });

    it('should handle complex release notes example', () => {
      const input = `## Version 1.0.0

### Features
- Added "config" option that wasn't there before
- Support for \`npm install\` command
- New $HOME directory support

### Bug Fixes
- Fixed issue where paths like C:\\Users\\name weren't working
- Resolved "can't connect" error messages`;
      
      const expected = `'## Version 1.0.0

### Features
- Added "config" option that wasn'\\''t there before
- Support for \`npm install\` command
- New $HOME directory support

### Bug Fixes
- Fixed issue where paths like C:\\Users\\name weren'\\''t working
- Resolved "can'\\''t connect" error messages'`;

      expect(escapeForShell(input)).toBe(expected);
    });
  });

  describe('escapeText', () => {
    it('should apply shell escaping when mode is "shell"', () => {
      expect(escapeText("can't", 'shell')).toBe("'can'\\''t'");
      expect(escapeText('$var', 'shell')).toBe("'$var'");
    });

    it('should not escape when mode is "none"', () => {
      expect(escapeText("can't", 'none')).toBe("can't");
      expect(escapeText('$var', 'none')).toBe('$var');
    });

    it('should default to no escaping when mode is not specified', () => {
      expect(escapeText("can't")).toBe("can't");
      expect(escapeText('$var')).toBe('$var');
    });
  });
});