import { describe, it, expect } from 'vitest';
import { stripLeadingQuote } from '../sort-key';

describe('stripLeadingQuote', () => {
  it('leaves a plain string unchanged', () => {
    expect(stripLeadingQuote('ABBA')).toBe('ABBA');
  });

  it('strips a leading straight single quote', () => {
    expect(stripLeadingQuote("'Twas")).toBe('Twas');
  });

  it('strips a leading straight double quote', () => {
    expect(stripLeadingQuote('"Heroes"')).toBe('Heroes"');
  });

  it('strips a leading left single curly quote (\u2018)', () => {
    expect(stripLeadingQuote('\u2018Twas')).toBe('Twas');
  });

  it('strips a leading left double curly quote (\u201C)', () => {
    expect(stripLeadingQuote('\u201CHeroes')).toBe('Heroes');
  });

  it('does NOT strip a quote in the middle of a string', () => {
    expect(stripLeadingQuote("Rock 'n' Roll")).toBe("Rock 'n' Roll");
  });

  it('returns an empty string unchanged', () => {
    expect(stripLeadingQuote('')).toBe('');
  });
});
