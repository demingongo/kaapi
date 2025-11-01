import parentConfig from '../../eslint.config.mjs';
import { defineConfig } from 'eslint/config';


export default defineConfig([
    ...parentConfig,
    {
        files: ['{src,test}/**/*.ts', '*.{ts,mjs}'],

        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    varsIgnorePattern: '^_'
                }
            ]
        },
    }
]);