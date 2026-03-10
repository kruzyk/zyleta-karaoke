/**
 * Convert ISO 3166-1 alpha-2 country code to flag emoji.
 * Works by converting each letter to its Regional Indicator Symbol.
 * Example: 'US' → '🇺🇸', 'PL' → '🇵🇱', 'GB' → '🇬🇧'
 */
export function countryCodeToFlag(code: string): string {
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    ...upper.split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/** Short display names for common country codes */
const COUNTRY_NAMES: Record<string, Record<string, string>> = {
  en: {
    US: 'USA',
    GB: 'UK',
    SE: 'Sweden',
    AU: 'Australia',
    FR: 'France',
    DE: 'Germany',
    IE: 'Ireland',
    JM: 'Jamaica',
    BB: 'Barbados',
    ES: 'Spain',
    IT: 'Italy',
    BR: 'Brazil',
    JP: 'Japan',
    KR: 'South Korea',
    CA: 'Canada',
    NL: 'Netherlands',
    NO: 'Norway',
    FI: 'Finland',
    AT: 'Austria',
    CH: 'Switzerland',
    PT: 'Portugal',
    RU: 'Russia',
    UA: 'Ukraine',
    PL: 'Poland',
  },
  pl: {
    US: 'USA',
    GB: 'Wlk. Bryt.',
    SE: 'Szwecja',
    AU: 'Australia',
    FR: 'Francja',
    DE: 'Niemcy',
    IE: 'Irlandia',
    JM: 'Jamajka',
    BB: 'Barbados',
    ES: 'Hiszpania',
    IT: 'Włochy',
    BR: 'Brazylia',
    JP: 'Japonia',
    KR: 'Korea Płd.',
    CA: 'Kanada',
    NL: 'Holandia',
    NO: 'Norwegia',
    FI: 'Finlandia',
    AT: 'Austria',
    CH: 'Szwajcaria',
    PT: 'Portugalia',
    RU: 'Rosja',
    UA: 'Ukraina',
    PL: 'Polska',
  },
};

export function getCountryName(code: string, lang: string = 'en'): string {
  const names = COUNTRY_NAMES[lang] || COUNTRY_NAMES.en;
  return names[code] || code;
}
