import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          // Off by design: Vite consumes workspace libraries as TypeScript source through
          // the TS-solution project references, so no library needs its own build output
          // for an app to bundle it. Leaving this on flags every source-consumed lib.
          enforceBuildableLibDependency: false,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // --- type dimension: which layers may depend on which ---
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:ui',
                'type:data-access',
                'type:domain',
                'type:util',
                'type:api-interfaces',
              ],
            },
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:ui',
                'type:data-access',
                'type:domain',
                'type:util',
                'type:api-interfaces',
              ],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: [
                'type:ui',
                'type:domain',
                'type:util',
                'type:api-interfaces',
              ],
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: [
                'type:data-access',
                'type:domain',
                'type:util',
                'type:api-interfaces',
                'type:data',
              ],
            },
            // Plain data packages (e.g. the CMS-owned `content/` files) contain no code and
            // import nothing; only data-access reads them, and validates them on the way in.
            { sourceTag: 'type:data', onlyDependOnLibsWithTags: [] },
            // Domain is the innermost layer: pure models, no framework, no I/O.
            {
              sourceTag: 'type:domain',
              onlyDependOnLibsWithTags: ['type:domain', 'type:util'],
            },
            { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util'] },
            {
              sourceTag: 'type:api-interfaces',
              onlyDependOnLibsWithTags: ['type:api-interfaces', 'type:domain'],
            },
            // End-to-end projects drive the built site from outside: they import no workspace code.
            { sourceTag: 'type:e2e', onlyDependOnLibsWithTags: [] },
            // Build-time tooling (e.g. the asset pipeline) reads the domain manifests.
            {
              sourceTag: 'type:tool',
              onlyDependOnLibsWithTags: ['type:domain', 'type:util'],
            },

            // --- scope dimension: strict bounded-context isolation ---
            //
            // This is the rule that makes the project forkable. A scene library may NOT
            // import content: landmarks receive their copy as props, and `apps/web` is the
            // sole composition root that wires the two together. Without this, content
            // references leak into scene internals and a forker has to edit components
            // rather than data. Each context may reach only itself and `scope:shared`.
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:world',
              onlyDependOnLibsWithTags: ['scope:world', 'scope:shared'],
            },
            {
              sourceTag: 'scope:dive',
              onlyDependOnLibsWithTags: ['scope:dive', 'scope:shared'],
            },
            {
              sourceTag: 'scope:landmarks',
              onlyDependOnLibsWithTags: ['scope:landmarks', 'scope:shared'],
            },
            {
              sourceTag: 'scope:content',
              onlyDependOnLibsWithTags: ['scope:content', 'scope:shared'],
            },
            {
              sourceTag: 'scope:complaints',
              onlyDependOnLibsWithTags: ['scope:complaints', 'scope:shared'],
            },
            {
              sourceTag: 'scope:telemetry',
              onlyDependOnLibsWithTags: ['scope:telemetry', 'scope:shared'],
            },
            {
              sourceTag: 'scope:tools',
              onlyDependOnLibsWithTags: ['scope:tools', 'scope:world', 'scope:shared'],
            },

            // --- platform dimension ---
            //
            // Serverless handlers must never pull in browser/R3F code, and the reverse.
            // `platform:shared` libraries are the only ones both sides may import.
            {
              sourceTag: 'platform:serverless',
              onlyDependOnLibsWithTags: ['platform:serverless', 'platform:shared'],
            },
            {
              sourceTag: 'platform:web',
              onlyDependOnLibsWithTags: ['platform:web', 'platform:shared'],
            },
            {
              sourceTag: 'platform:shared',
              onlyDependOnLibsWithTags: ['platform:shared'],
            },
            {
              sourceTag: 'platform:node',
              onlyDependOnLibsWithTags: ['platform:node', 'platform:shared'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
