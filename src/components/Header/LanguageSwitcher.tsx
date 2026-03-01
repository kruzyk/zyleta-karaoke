import { useTranslation } from 'react-i18next';
import styles from './LanguageSwitcher.module.css';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const currentLang = i18n.language;

  const toggleLanguage = () => {
    const next = currentLang === 'en' ? 'pl' : 'en';
    i18n.changeLanguage(next);
  };

  return (
    <button
      onClick={toggleLanguage}
      className={styles.button}
      aria-label={t('header.switchLanguage')}
      title={t('header.switchLanguage')}
    >
      <span className={styles.label}>
        {currentLang === 'en' ? 'PL' : 'EN'}
      </span>
    </button>
  );
}
