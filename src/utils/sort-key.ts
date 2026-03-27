/**
 * Strips a leading smart or straight quote character from a string.
 * Used to normalize sort keys for artist/title fields.
 */
export function stripLeadingQuote(value: string): string {
  return value.replace(/^['"\u2018\u201C]/, '');
}
