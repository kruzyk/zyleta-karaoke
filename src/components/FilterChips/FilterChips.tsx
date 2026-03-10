import { useTranslation } from 'react-i18next';
import type { MainFilter, DecadeFilter } from '@/types/song';
import type { FeatureFlags } from '@/hooks/useFeatureFlags';
import { countryCodeToFlag, getCountryName } from '@/utils/country-flags';
import styles from './FilterChips.module.css';

interface FilterChipsProps {
  activeMain: MainFilter;
  activeDecade: DecadeFilter | null;
  activeCountry: string | null;
  availableCountries: string[];
  availableDecades: DecadeFilter[];
  featureFlags: FeatureFlags;
  onMainChange: (main: MainFilter) => void;
  onDecadeChange: (decade: DecadeFilter | null) => void;
  onCountryChange: (country: string | null) => void;
}

const MAIN_FILTERS: MainFilter[] = ['all', 'international', 'polish'];

export function FilterChips({
  activeMain,
  activeDecade,
  activeCountry,
  availableCountries,
  availableDecades,
  featureFlags,
  onMainChange,
  onDecadeChange,
  onCountryChange,
}: FilterChipsProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  // Build main chips list — "decades" only shows if feature flag enabled
  const mainChips: MainFilter[] = featureFlags.decades
    ? [...MAIN_FILTERS, 'decades']
    : MAIN_FILTERS;

  // Show country sub-chips when "international" is active AND feature flag is on
  const showCountrySubChips =
    activeMain === 'international' &&
    featureFlags.international &&
    availableCountries.length > 0;

  // Show decade sub-chips when "decades" is active AND feature flag is on
  const showDecadeSubChips =
    activeMain === 'decades' &&
    featureFlags.decades &&
    availableDecades.length > 0;

  return (
    <div className={styles.container} role="navigation" aria-label={t('filter.ariaLabel')}>
      {/* Main filter chips */}
      <div className={styles.chipRow} role="tablist" aria-label={t('filter.mainLabel')}>
        {mainChips.map((filter) => (
          <button
            key={filter}
            className={`${styles.chip} ${activeMain === filter ? styles.chipActive : ''}`}
            onClick={() => onMainChange(filter)}
            role="tab"
            aria-selected={activeMain === filter}
          >
            {t(`filter.main.${filter}`)}
          </button>
        ))}
      </div>

      {/* Country sub-chips */}
      {showCountrySubChips && (
        <div className={styles.subChipRow} role="tablist" aria-label={t('filter.countryLabel')}>
          {availableCountries.map((code) => (
            <button
              key={code}
              className={`${styles.subChip} ${activeCountry === code ? styles.subChipActive : ''}`}
              onClick={() => onCountryChange(activeCountry === code ? null : code)}
              role="tab"
              aria-selected={activeCountry === code}
              title={getCountryName(code, lang)}
            >
              <span className={styles.flag} aria-hidden="true">
                {countryCodeToFlag(code)}
              </span>
              {getCountryName(code, lang)}
            </button>
          ))}
        </div>
      )}

      {/* Decade sub-chips */}
      {showDecadeSubChips && (
        <div className={styles.subChipRow} role="tablist" aria-label={t('filter.decadeLabel')}>
          {availableDecades.map((decade) => (
            <button
              key={decade}
              className={`${styles.subChip} ${activeDecade === decade ? styles.subChipActive : ''}`}
              onClick={() => onDecadeChange(activeDecade === decade ? null : decade)}
              role="tab"
              aria-selected={activeDecade === decade}
            >
              {t(`filter.decade.${decade}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
