/**
 * ISO 3166-1 alpha-2 country code validation and normalization.
 *
 * Used to validate country data from music APIs (MusicBrainz, Discogs)
 * and reject release-region values like "Europe" or "UK & Europe".
 */

/** Valid ISO 3166-1 alpha-2 country codes */
const ISO_COUNTRY_CODES = new Set([
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
  'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA',
  'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
  'WF', 'WS',
  'XK', // Kosovo (user-assigned, widely used)
  'YE', 'YT',
  'ZA', 'ZM', 'ZW',
  // MusicBrainz-specific codes
  'XW', // Worldwide
  'XE', // Europe (MusicBrainz)
]);

/** Common full names and abbreviations → ISO code */
const COUNTRY_NAME_MAP: Record<string, string> = {
  'poland': 'PL',
  'uk': 'GB',
  'united kingdom': 'GB',
  'england': 'GB',
  'scotland': 'GB',
  'wales': 'GB',
  'germany': 'DE',
  'france': 'FR',
  'italy': 'IT',
  'spain': 'ES',
  'netherlands': 'NL',
  'belgium': 'BE',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'ireland': 'IE',
  'austria': 'AT',
  'switzerland': 'CH',
  'portugal': 'PT',
  'czech republic': 'CZ',
  'czechia': 'CZ',
  'romania': 'RO',
  'hungary': 'HU',
  'croatia': 'HR',
  'serbia': 'RS',
  'slovenia': 'SI',
  'slovakia': 'SK',
  'bulgaria': 'BG',
  'greece': 'GR',
  'turkey': 'TR',
  'russia': 'RU',
  'ukraine': 'UA',
  'canada': 'CA',
  'australia': 'AU',
  'new zealand': 'NZ',
  'japan': 'JP',
  'china': 'CN',
  'south korea': 'KR',
  'brazil': 'BR',
  'mexico': 'MX',
  'argentina': 'AR',
  'colombia': 'CO',
  'south africa': 'ZA',
  'jamaica': 'JM',
  'cuba': 'CU',
  'india': 'IN',
  'israel': 'IL',
  'iceland': 'IS',
  'luxembourg': 'LU',
  'malta': 'MT',
  'cyprus': 'CY',
  'latvia': 'LV',
  'lithuania': 'LT',
  'estonia': 'EE',
  'montenegro': 'ME',
  'north macedonia': 'MK',
  'albania': 'AL',
  'bosnia and herzegovina': 'BA',
  'moldova': 'MD',
  'georgia': 'GE',
  'armenia': 'AM',
  'puerto rico': 'PR',
  'barbados': 'BB',
  'trinidad and tobago': 'TT',
  'usa': 'US',
  'united states': 'US',
};

/**
 * Values known to be release regions (from Discogs), NOT artist countries.
 * These should be rejected entirely.
 */
const RELEASE_REGIONS = new Set([
  'europe',
  'uk & europe',
  'uk, europe & us',
  'usa & europe',
  'usa, canada & europe',
  'worldwide',
  'scandinavia',
  'australasia',
  'south america',
  'uk & us',
  'australia & new zealand',
  'france & benelux',
  'germany, austria, & switzerland',
  'unknown',
  'ussr',
  'yugoslavia',
  'czechoslovakia',
]);

/**
 * Check if a string is a valid ISO 3166-1 alpha-2 country code.
 */
export function isValidIsoCountry(code: string): boolean {
  return ISO_COUNTRY_CODES.has(code.toUpperCase());
}

/**
 * Normalize a country value to ISO 3166-1 alpha-2.
 * Returns null if the value is a release region or unrecognized.
 */
export function normalizeCountry(value: string): string | null {
  if (!value) return null;

  const trimmed = value.trim();

  // Already a valid ISO code?
  if (/^[A-Z]{2}$/.test(trimmed) && ISO_COUNTRY_CODES.has(trimmed)) {
    return trimmed;
  }

  // Check release regions (reject)
  if (RELEASE_REGIONS.has(trimmed.toLowerCase())) {
    return null;
  }

  // Try full name mapping
  const mapped = COUNTRY_NAME_MAP[trimmed.toLowerCase()];
  if (mapped) return mapped;

  // Uppercase 2-char that might be valid
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper) && ISO_COUNTRY_CODES.has(upper)) {
    return upper;
  }

  // Unrecognized — reject
  return null;
}

/**
 * Get the set of valid ISO codes for use in AI prompts.
 */
export function getIsoCountryList(): string[] {
  return Array.from(ISO_COUNTRY_CODES).sort();
}
