import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // src/generated is the Prisma client, written by the prisma-generate target.
    ignores: ['**/out-tsc', 'src/generated/**'],
  },
];
