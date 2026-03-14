import { useState, useEffect } from 'react';
import config from '@/config';

/**
 * Feature flags hook with three-tier resolution:
 *
 * 1. Vite env vars (local dev override):
 *    VITE_FF_DECADES=true / VITE_FF_INTERNATIONAL=true
 *
 * 2. ConfigCat (production, managed via dashboard UI):
 *    Requires VITE_CONFIGCAT_SDK_KEY in .env or GitHub Actions secret.
 *    Flags: "decades" (boolean), "international" (boolean)
 *
 * 3. Fallback to config.ts values (if ConfigCat unavailable or SDK key missing)
 */

export interface FeatureFlags {
  decades: boolean;
  international: boolean;
  isLoading: boolean;
}

/** Check if a Vite env var is explicitly set */
function envFlag(name: string): boolean | undefined {
  const val = import.meta.env[name];
  if (val === undefined || val === '') return undefined;
  return val === 'true' || val === '1';
}

function getLocalOverrides(): Partial<Pick<FeatureFlags, 'decades' | 'international'>> {
  const overrides: Partial<Pick<FeatureFlags, 'decades' | 'international'>> = {};
  const decades = envFlag('VITE_FF_DECADES');
  const international = envFlag('VITE_FF_INTERNATIONAL');
  if (decades !== undefined) overrides.decades = decades;
  if (international !== undefined) overrides.international = international;
  return overrides;
}

export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>({
    decades: config.features.decades,
    international: config.features.international,
    isLoading: true,
  });

  /* eslint-disable react-you-might-not-need-an-effect/no-initialize-state --
     Async ConfigCat fetch — must live in useEffect, not a useState initializer */
  useEffect(() => {
    let cancelled = false;

    async function loadFlags() {
      const localOverrides = getLocalOverrides();

      // If ALL flags are overridden locally, skip ConfigCat entirely
      if (localOverrides.decades !== undefined && localOverrides.international !== undefined) {
        if (!cancelled) {
          setFlags({
            decades: localOverrides.decades,
            international: localOverrides.international,
            isLoading: false,
          });
        }
        return;
      }

      // Try ConfigCat if SDK key is available
      const sdkKey = import.meta.env.VITE_CONFIGCAT_SDK_KEY;
      if (sdkKey) {
        try {
          const configcat = await import('configcat-js');
          const client = configcat.getClient(sdkKey, configcat.PollingMode.AutoPoll, {
            pollIntervalSeconds: 300, // 5 min refresh
          });

          const [decadesVal, internationalVal] = await Promise.all([
            client.getValueAsync('decadesFilter', config.features.decades),
            client.getValueAsync('international', config.features.international),
          ]);

          if (!cancelled) {
            setFlags({
              decades: localOverrides.decades ?? decadesVal,
              international: localOverrides.international ?? internationalVal,
              isLoading: false,
            });
          }
        } catch {
          // ConfigCat failed — use config.ts fallback
          if (!cancelled) {
            setFlags({
              decades: localOverrides.decades ?? config.features.decades,
              international: localOverrides.international ?? config.features.international,
              isLoading: false,
            });
          }
        }
      } else {
        // No SDK key — use config.ts values (with local overrides)
        if (!cancelled) {
          setFlags({
            decades: localOverrides.decades ?? config.features.decades,
            international: localOverrides.international ?? config.features.international,
            isLoading: false,
          });
        }
      }
    }

    loadFlags();
    return () => {
      cancelled = true;
    };
  }, []);
  /* eslint-enable react-you-might-not-need-an-effect/no-initialize-state */

  return flags;
}
