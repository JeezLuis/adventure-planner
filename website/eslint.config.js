import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * ESLint flat config (ESLint 9). Replaces the legacy .eslintrc.cjs, which
 * ESLint 9 no longer reads - so `eslint .` was silently a no-op before this.
 * Advisory in CI for now; graduates to a blocking gate once the inherited
 * findings are cleaned up.
 */
export default [
    {
        ignores: [
            'build/',
            '.svelte-kit/',
            'package/',
            'node_modules/',
            // Generated shadcn-svelte primitives: vendored, not ours to lint.
            'src/lib/components/ui/**',
        ],
    },
    js.configs.recommended,
    {
        files: ['**/*.{ts,js}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                sourceType: 'module',
                ecmaVersion: 2022,
                extraFileExtensions: ['.svelte'],
            },
            globals: { ...globals.browser, ...globals.node },
        },
        plugins: { '@typescript-eslint': tsPlugin },
        rules: { ...tsPlugin.configs.recommended.rules },
    },
    ...svelte.configs['flat/recommended'],
    {
        files: ['**/*.svelte'],
        languageOptions: {
            parser: svelteParser,
            parserOptions: { parser: tsParser },
            globals: { ...globals.browser },
        },
    },
    prettier,
    ...svelte.configs['flat/prettier'],
];
