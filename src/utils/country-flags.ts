import type { SongCountry } from '@/types/song';

const COUNTRY_FLAGS: Record<SongCountry, string> = {
  PL: '🇵🇱',
  EN: '🇬🇧',
  Sweden: '🇸🇪',
  Norway: '🇳🇴',
  Spain: '🇪🇸',
  Italy: '🇮🇹',
  Germany: '🇩🇪',
};

export function countryCodeToFlag(code: SongCountry): string {
  return COUNTRY_FLAGS[code] ?? '';
}

const COUNTRY_NAMES: Record<string, Record<SongCountry, string>> = {
  en: {
    PL: 'Poland',
    EN: 'English',
    Sweden: 'Sweden',
    Norway: 'Norway',
    Spain: 'Spain',
    Italy: 'Italy',
    Germany: 'Germany',
  },
  pl: {
    PL: 'Polska',
    EN: 'Angielski',
    Sweden: 'Szwecja',
    Norway: 'Norwegia',
    Spain: 'Hiszpania',
    Italy: 'Włochy',
    Germany: 'Niemcy',
  },
};

export function getCountryName(code: SongCountry, lang: string = 'en'): string {
  const names = COUNTRY_NAMES[lang] || COUNTRY_NAMES.en;
  return names[code] || code;
}
