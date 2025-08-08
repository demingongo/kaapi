import fs from 'node:fs';
import path from 'node:path';

export async function loadKaapiConfig() {
    const configNames = ['kaapi.config.ts', 'kaapi.config.js'];
    let configPath: string | undefined;

    for (const name of configNames) {
        const fullPath = path.resolve(process.cwd(), name);
        if (fs.existsSync(fullPath)) {
            configPath = fullPath;
            break;
        }
    }

    if (!configPath) {
        throw new Error('No kaapi config file found.');
    }

    // Register ts-node if loading a TypeScript config
    if (configPath.endsWith('.ts')) {
        // Dynamically import ts-node only if needed
        // @ts-expect-error because no types for it
        await import('ts-node/register');
    }

    // Support both CommonJS and ESM exports
    const configModule = await import(configPath);
    const config = configModule.default || configModule;

    return config;
}