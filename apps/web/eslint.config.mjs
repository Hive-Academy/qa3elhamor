import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // User-authored text (the complaints wall) must only ever render as text (docs/security.md).
    rules: { 'react/no-danger': 'error' },
  },
];
