module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'scripts'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', 'react-you-might-not-need-an-effect'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],

    // Catch unnecessary useEffect patterns
    // https://github.com/nickjvandyke/eslint-plugin-react-you-might-not-need-an-effect
    'react-you-might-not-need-an-effect/no-direct-set-state-in-use-effect': 'warn',
    'react-you-might-not-need-an-effect/no-direct-set-state-in-use-layout-effect': 'warn',
  },
};
