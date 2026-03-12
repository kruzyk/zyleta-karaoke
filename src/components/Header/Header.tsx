import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import type { Theme } from '@/types/song';
import LogoSvg from '@/assets/logo.svg?url';
import styles from './Header.module.css';

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export function Header({ theme, onToggleTheme }: HeaderProps) {
  const { t } = useTranslation();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a href={import.meta.env.BASE_URL} className={styles.logoLink} aria-label={t('header.title')}>
          <img src={LogoSvg} alt={t('header.title')} className={styles.logo} />
        </a>

        <div className={styles.controls}>
          <LanguageSwitcher />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>
    </header>
  );
}
