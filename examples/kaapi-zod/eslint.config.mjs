import parentConfig from '../../eslint.config.mjs';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    ...parentConfig,
    {
        files: ['src/**/*.ts', '*.{ts,mjs}'],
        rules: {
            '@stylistic/js/quotes': ['warn', 'single'],
            '@stylistic/js/quote-props': ['warn', 'as-needed'],
            '@typescript-eslint/no-unused-expressions': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/no-explicit-any': 'off',
        }
    }
]);

