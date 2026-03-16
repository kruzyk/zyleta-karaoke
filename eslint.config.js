import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import reactEffect from 'eslint-plugin-react-you-might-not-need-an-effect';
import globals from 'globals';

export default tseslint.config(
  // Global ignores
  { ignores: ['dist/', 'scripts/', 'eslint.config.js'] },

  // Base configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // React hooks (v5 flat config)
  reactHooks.configs['recommended-latest'],

  // React useEffect best practices (all 9 rules as warnings)
  reactEffect.configs.recommended,

  // Project-wide settings
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
);
