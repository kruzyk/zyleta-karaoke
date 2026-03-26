import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './SearchBar.module.css';

interface SearchBarProps {
  query: string;
  onChange: (query: string) => void;
  resultCount: number;
  totalCount: number;
  isSearching: boolean;
}

export function SearchBar({
  query,
  onChange,
  resultCount,
  totalCount,
  isSearching,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <svg
          className={styles.searchIcon}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('search.placeholder')}
          className={`${styles.input} ${!query ? styles.inputWithCount : ''}`}
          aria-label={t('search.placeholder')}
          autoComplete="off"
          spellCheck={false}
        />

        {!query && (
          <span className={styles.inlineCount} aria-live="polite" aria-atomic="true">
            {isSearching
              ? t('search.resultsCount', { count: resultCount })
              : t('search.resultsCountAll', { count: totalCount })}
          </span>
        )}

        {query && (
          <button
            onClick={handleClear}
            className={styles.clearButton}
            aria-label={t('search.clear')}
            type="button"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
