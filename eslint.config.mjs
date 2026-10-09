import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Architecture rules:
// 1. No component imports src/server/store|seed|telemetry
// 2. No `role ===` outside capabilities.ts and session builder
// 3. No Date.now() or new Date() outside clock.ts and seed/telemetry
// 4. No "device" or "Dozr" in src/
// 5. No getState() in app/ or src/components/ (F2): screens read through hooks.

// The restricted-syntax rules every source file follows.
const BASE_RESTRICTED_SYNTAX = [
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
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Use clock.now(). See src/lib/clock.ts.',
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
  {
    selector: 'BinaryExpression[operator="==="][left.property.name="role"]',
    message: 'Use can(session, cap) / hasRole() instead of role === comparisons.',
  },
];

// Screens and components read state through a hook (src/hooks), never by calling
// getState(): a getState() read does not re-render when the value changes. This
// covers handlers too. The architecture test is the backstop.
const NO_GET_STATE = {
  selector: 'Identifier[name="getState"]',
  message: 'Read state with a hook from @/hooks (useSession, useSwitches, useDb...), or storeActions in a handler. getState() does not re-render.',
};

export default [
  { ignores: ['dist', '.next', 'node_modules'] },

  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
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
      'react-hooks/rules-of-hooks': 'error',
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX],
      // Allow underscore-prefixed args/vars (intentionally unused params)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },

  // Screens and components: no getState(), anywhere (F2).
  {
    files: ['app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX, NO_GET_STATE],
    },
  },

  // Allow Date.now() and new Date() in clock.ts, seed, and telemetry
  {
    files: ['src/lib/clock.ts', 'src/server/seed/**/*.ts', 'src/server/telemetry/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Allow role comparisons only in the role→capability and role→words maps.
  // (capability-reasons.ts is mandated by the spec to map roles to plain-word
  // reason text — see reviews/STATUS-REVIEW.md §7.5.) Test files build sessions
  // the way the session builder does, so they share the allowance; the
  // architecture tests grep non-test sources.
  {
    files: ['src/server/capabilities.ts', 'src/server/capability-reasons.ts', 'src/server/seed/**/*.ts', '**/*.test.ts', '**/*.test.tsx', 'tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
