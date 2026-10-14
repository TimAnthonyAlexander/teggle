import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Code that feeds the simulation must give bit-identical results in every JS engine
// (spec 13.4). ECMA-262 lets engines approximate these Math functions and `**`, so
// deterministic code uses src/core/dmath.ts instead. Math.sqrt is exactly rounded and allowed.
const approximatedMath = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'cbrt',
  'hypot',
  'random',
];

const deterministicDirs = [
  'src/core/**/*.ts',
  'src/sim/**/*.ts',
  'src/rules/**/*.ts',
  'src/level/**/*.ts',
  'src/gen/**/*.ts',
  'src/agents/**/*.ts',
];

export default defineConfig(
  {
    ignores: ['dist/', 'coverage/', 'reference/', 'public/', 'playwright-report/', 'test-results/'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: deterministicDirs,
    rules: {
      'no-restricted-properties': [
        'error',
        ...approximatedMath.map((property) => ({
          object: 'Math',
          property,
          message: 'Engine-approximated. Use src/core/dmath.ts (spec 13.4).',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
          message: 'Exponentiation is engine-approximated. Multiply explicitly (spec 13.4).',
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'Date',
          'performance',
          'window',
          'document',
          'navigator',
          'localStorage',
          'crypto',
          'requestAnimationFrame',
          'setTimeout',
          'setInterval',
        ].map((name) => ({
          name,
          message:
            'Deterministic code may not depend on the environment, time or ambient randomness.',
        })),
      ],
    },
  },
  {
    // Tests compare deterministic code against the native functions.
    files: ['src/**/*.test.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['tools/**/*.ts', '*.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
