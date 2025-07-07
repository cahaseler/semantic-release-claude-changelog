/**
 * Escapes special characters in a string for safe use in shell commands
 * @param text The text to escape
 * @returns The escaped text safe for shell use
 */
export function escapeForShell(text: string): string {
  // The safest way to escape for shell is to wrap in single quotes
  // and escape any single quotes by ending the quote, adding an escaped
  // single quote, and starting a new quoted section.
  // Example: can't becomes 'can'\''t'
  if (!text) return "''";
  
  const escaped = text.replace(/'/g, "'\\''");
  return `'${escaped}'`;
}

/**
 * Escapes text based on the specified escaping mode
 * @param text The text to escape
 * @param mode The escaping mode ('shell' or 'none')
 * @returns The escaped (or unescaped) text
 */
export function escapeText(text: string, mode: 'shell' | 'none' = 'none'): string {
  switch (mode) {
    case 'shell':
      return escapeForShell(text);
    case 'none':
    default:
      return text;
  }
}