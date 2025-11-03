import parentConfig from '../../eslint.config.mjs';
import { defineConfig } from 'eslint/config';


export default defineConfig([
    ...parentConfig,
    {
        files: ['test/**/*.ts'],

        rules: {
            '@typescript-eslint/no-unused-expressions': 'off'
        },
    }
]);