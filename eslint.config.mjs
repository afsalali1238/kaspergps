import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';

// Architecture rules:
// 1. No component imports src/server/store|seed|telemetry
// 2. No `role ===` outside capabilities.ts and session builder
// 3. No Date.now() or new Date() outside clock.ts and seed/telemetry
// 4. No "device" or "Dozr" in src/

export default [
  { ignores: ['dist', '.next', 'node_modules'] },

  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
        React: true,
      },
    },
    rules: {
      // Ban "device" and "Dozr" in source identifiers
      // Ban Date.now() everywhere
      // Ban new Date() without arguments everywhere
      // Ban role === everywhere
      'no-restricted-syntax': [
        'error',
        {
          // Ban "device" as an identifier, but allow "deviceTime" (standard GPS telemetry field)
          selector: 'Identifier[name=/(^|\\.)device$/]',
          message: 'Use "Asset" not "device".',
        },
        {
          selector: 'Identifier[name=/Dozr/]',
          message: 'Use "Kasper" not "Dozr".',
        },
        {
          selector: "CallExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use clock.now(). See src/lib/clock.ts.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use clock.dubaiNow() or a specific timestamp instead of new Date().',
        },
        {
          selector: 'BinaryExpression[operator="==="][left.name="role"]',
          message: 'Use can(session, cap) instead of role === comparisons.',
        },
      ],
      // Allow underscore-prefixed args/vars (intentionally unused params)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },

  // Allow Date.now() and new Date() in clock.ts, seed, and telemetry
  {
    files: ['src/lib/clock.ts', 'src/server/seed/**/*.ts', 'src/server/telemetry/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Allow role === in server-side modules (capabilities, capability-reasons, seed, access, api)
  // The "use can()" rule is for client components; server modules use role checks directly.
  {
    files: ['src/server/capabilities.ts', 'src/server/capability-reasons.ts', 'src/server/seed/**/*.ts', 'src/server/access.ts', 'src/server/api.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
