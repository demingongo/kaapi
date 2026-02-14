import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import stylisticJs from '@stylistic/eslint-plugin';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default defineConfig([
    { ignores: ['lib/', 'dist/', 'build/', 'coverage/'] },
    {
        extends: compat.extends('eslint:recommended', 'plugin:@typescript-eslint/recommended'),
        files: ['{src,test}/**/*.ts', '*.{ts,mjs}'],

        plugins: {
            '@typescript-eslint': typescriptEslint,
            '@stylistic/js': stylisticJs,
        },

        languageOptions: {
            globals: {
                ...globals.node,
            },

            parser: tsParser,
            ecmaVersion: 6,
            sourceType: 'module',
        },

        rules: {
            '@stylistic/js/quotes': ['error', 'single'],
            '@stylistic/js/quote-props': ['error', 'as-needed'],
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
        },
    },
    {
        extends: [...compat.extends('eslint:recommended')],
        files: ['*.js'],

        plugins: {
            '@stylistic/js': stylisticJs,
        },

        languageOptions: {
            globals: {
                ...globals.node,
            },

            ecmaVersion: 8,
            sourceType: 'commonjs',
        },

        rules: {
            '@stylistic/js/quotes': ['error', 'single'],
            '@stylistic/js/quote-props': ['error', 'as-needed'],
        },
    },
    eslintConfigPrettier,
]);
