const config = {
  siteName: 'Żyleta Karaoke',
  siteUrl: 'https://kruzyk.github.io/zyleta-karaoke', // Update with your GitHub Pages URL
  defaultLanguage: 'en' as const,
  defaultTheme: 'dark' as const,

  social: {
    facebook: 'https://www.facebook.com/MaryJaneRazorKaraoke', // e.g., 'https://facebook.com/zyletakaraoke'
    instagram: 'https://www.instagram.com/zyleta.karaoke', // e.g., 'https://instagram.com/zyletakaraoke'
  },

  seo: {
    titleEn: 'Żyleta Karaoke — Song List',
    titlePl: 'Żyleta Karaoke — Lista Piosenek',
    descriptionEn:
      'Browse 5000+ karaoke songs. Find your favorite track by artist or title and sing!',
    descriptionPl:
      'Przeglądaj ponad 5000 piosenek karaoke. Znajdź swój ulubiony utwór po wykonawcy lub tytule i śpiewaj!',
  },

  search: {
    debounceMs: 200,
    fuzzyThreshold: 0.35,
    minCharacters: 1,
  },
} as const;

export default config;
