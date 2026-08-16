import parentConfig from '../../eslint.config.mjs';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import stylisticJs from '@stylistic/eslint-plugin';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import { importX } from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { defineConfig } from 'eslint/config';
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
    { ignores: ['src/drafts'] },
    ...parentConfig,
    {
        extends: compat.extends(
            'eslint:recommended',
            'plugin:@typescript-eslint/recommended',
        ),
        files: ['{src,test}/**/*.ts', '**/*.mts'],

        plugins: {
            '@typescript-eslint': typescriptEslint,
            '@stylistic': stylisticJs,
            'import-x': importX,
        },
        rules: {
            '@stylistic/quotes': ['error', 'single'],
            '@stylistic/quote-props': ['error', 'as-needed'],
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            'import-x/no-cycle': ['error', { maxDepth: Infinity }],
        },
        settings: {
            'import-x/resolver-next': [
                createTypeScriptImportResolver({
                    project: './tsconfig.json',
                })
            ],
        },
    }
]);


