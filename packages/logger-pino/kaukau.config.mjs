import { defineConfig } from 'kaukau/config';

export default defineConfig({
    exitOnFail: true,
    files: 'test/',
    ext: '.spec.ts',
});
