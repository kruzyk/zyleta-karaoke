import { describe, it, expect } from 'vitest';
import { createSearchIndex, searchSongs } from '../search';
import type { Song } from '@/types/song';

const testSongs: Song[] = [
  { id: '1', artist: 'Queen', title: 'Bohemian Rhapsody' },
  { id: '2', artist: 'Metallica', title: 'Enter Sandman' },
  { id: '3', artist: 'ABBA', title: 'Dancing Queen' },
  { id: '4', artist: 'Czesław Niemen', title: 'Dziwny jest ten świat' },
  { id: '5', artist: 'Edyta Górniak', title: 'To nie ja' },
  { id: '6', artist: 'Lady Gaga', title: 'Poker Face' },
  { id: '7', artist: 'Maryla Rodowicz', title: 'Kolorowe jarmarki' },
  { id: '8', artist: 'Adele', title: 'Someone Like You' },
  { id: '9', artist: 'Madonna', title: 'Like a Prayer' },
  { id: '10', artist: 'Bon Jovi', title: "It's My Life" },
  { id: '11', artist: 'Bob Marley', title: 'No Woman No Cry' },
  { id: '12', artist: 'Varius Manx', title: 'Orła cień' },
  { id: '13', artist: 'Michael Jackson', title: 'Man In The Mirror' },
  { id: '14', artist: 'Lady Gaga', title: 'Bad Romance' },
];

describe('search — word-prefix matching', () => {
  const index = createSearchIndex(testSongs);

  it('"man" finds "Varius Manx" (word "Manx" starts with "man")', () => {
    const results = searchSongs(index, 'man', testSongs);
    expect(results.some((s) => s.artist === 'Varius Manx')).toBe(true);
  });

  it('"man" finds "Man In The Mirror"', () => {
    const results = searchSongs(index, 'man', testSongs);
    expect(results.some((s) => s.title === 'Man In The Mirror')).toBe(true);
  });

  it('"man" does NOT find "Enter Sandman" (man is suffix)', () => {
    const results = searchSongs(index, 'man', testSongs);
    expect(results.some((s) => s.title === 'Enter Sandman')).toBe(false);
  });

  it('"man" does NOT find "No Woman No Cry" (man in middle of woman)', () => {
    const results = searchSongs(index, 'man', testSongs);
    expect(results.some((s) => s.title === 'No Woman No Cry')).toBe(false);
  });

  it('"man" does NOT find "Bad Romance" (man in middle of romance)', () => {
    const results = searchSongs(index, 'man', testSongs);
    expect(results.some((s) => s.title === 'Bad Romance')).toBe(false);
  });

  it('"like" finds "Someone Like You" and "Like a Prayer"', () => {
    const results = searchSongs(index, 'like', testSongs);
    expect(results.some((s) => s.title === 'Someone Like You')).toBe(true);
    expect(results.some((s) => s.title === 'Like a Prayer')).toBe(true);
    expect(results.length).toBe(2);
  });

  it('"queen" finds both Queen (artist) and Dancing Queen (title word)', () => {
    const results = searchSongs(index, 'queen', testSongs);
    expect(results.some((s) => s.artist === 'Queen')).toBe(true);
    expect(results.some((s) => s.title === 'Dancing Queen')).toBe(true);
  });
});

describe('search — case & accent insensitivity', () => {
  const index = createSearchIndex(testSongs);

  it('is case-insensitive', () => {
    const results = searchSongs(index, 'metallica', testSongs);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].artist).toBe('Metallica');
  });

  it('finds Polish artists with diacritics', () => {
    const results = searchSongs(index, 'Czesław', testSongs);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].artist).toBe('Czesław Niemen');
  });

  it('finds Polish artists WITHOUT diacritics (accent-insensitive)', () => {
    const results = searchSongs(index, 'Czeslaw', testSongs);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].artist).toBe('Czesław Niemen');
  });

  it('"gorniak" finds "Edyta Górniak"', () => {
    const results = searchSongs(index, 'gorniak', testSongs);
    expect(results.length).toBe(1);
    expect(results[0].artist).toBe('Edyta Górniak');
  });
});

describe('search — fuzzy fallback (typos)', () => {
  const index = createSearchIndex(testSongs);

  it('"Metalica" (typo) falls back to fuzzy and finds "Metallica"', () => {
    const results = searchSongs(index, 'Metalica', testSongs);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].artist).toBe('Metallica');
  });
});

describe('search — edge cases', () => {
  const index = createSearchIndex(testSongs);

  it('returns empty array for empty query', () => {
    expect(searchSongs(index, '', testSongs)).toEqual([]);
  });

  it('returns empty array for whitespace query', () => {
    expect(searchSongs(index, '   ', testSongs)).toEqual([]);
  });

  it('partial artist name works', () => {
    const results = searchSongs(index, 'Gaga', testSongs);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((s) => s.artist === 'Lady Gaga')).toBe(true);
  });
});
