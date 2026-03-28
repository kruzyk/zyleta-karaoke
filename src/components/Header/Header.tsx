import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import type { Theme } from '@/types/song';
import config from '@/config';
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
        <a
          href={import.meta.env.BASE_URL}
          className={styles.logoLink}
          aria-label={t('header.title')}
        >
          <svg
            viewBox="0 0 400 120"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-labelledby="logo-title"
            className={styles.logo}
          >
            <title id="logo-title">{t('header.title')}</title>
            <defs>
              <filter id="neon-glow-strong" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur1" />
                <feFlood floodColor="var(--neon-primary)" floodOpacity="0.6" result="color" />
                <feComposite in="color" in2="blur1" operator="in" result="glow1" />
                <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur2" />
                <feFlood floodColor="var(--neon-secondary)" floodOpacity="0.3" result="color2" />
                <feComposite in="color2" in2="blur2" operator="in" result="glow2" />
                <feMerge>
                  <feMergeNode in="glow1" />
                  <feMergeNode in="glow2" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="neon-glow-subtle" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feFlood floodColor="var(--neon-secondary)" floodOpacity="0.4" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <text
              x="200"
              y="55"
              textAnchor="middle"
              fontFamily="'Inter', sans-serif"
              fontWeight="700"
              fontSize="48"
              letterSpacing="2"
              fill="var(--neon-primary)"
              filter="url(#neon-glow-strong)"
            >
              ŻYLETA
            </text>
            <text
              x="200"
              y="95"
              textAnchor="middle"
              fontFamily="'Inter', sans-serif"
              fontWeight="500"
              fontSize="28"
              letterSpacing="8"
              fill="var(--neon-secondary)"
              filter="url(#neon-glow-subtle)"
            >
              KARAOKE
            </text>
            <line
              x1="40"
              y1="68"
              x2="130"
              y2="68"
              stroke="var(--neon-tertiary)"
              strokeWidth="1"
              opacity="0.6"
            />
            <line
              x1="270"
              y1="68"
              x2="360"
              y2="68"
              stroke="var(--neon-tertiary)"
              strokeWidth="1"
              opacity="0.6"
            />
          </svg>
        </a>

        <div className={styles.controls}>
          {config.social.facebook && (
            <a
              href={config.social.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.socialLink}
              aria-label={t('footer.aria.facebook')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
          )}
          {config.social.instagram && (
            <a
              href={config.social.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.socialLink}
              aria-label={t('footer.aria.instagram')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </a>
          )}
          <LanguageSwitcher />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>
    </header>
  );
}
