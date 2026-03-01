import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import pl from './pl.json';
import config from '@/config';

const STORAGE_KEY = 'zyleta-language';

function getInitialLanguage(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'pl') return stored;
  return config.defaultLanguage;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    pl: { translation: pl },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(STORAGE_KEY, lng);
  document.documentElement.lang = lng;
});

// Set initial lang attribute
document.documentElement.lang = i18n.language;

export default i18n;
