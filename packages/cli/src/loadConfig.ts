import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'url';

export async function loadKaapiConfig() {
    const configNames = ['kaapi.config.mjs', 'kaapi.config.js'];
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

    // Support both CommonJS and ESM exports
    const configModulePath = path.resolve(configPath);
    const configModuleUrl = pathToFileURL(configModulePath).href;
    const configModule = await import(configModuleUrl);
    const config = configModule.default || configModule;

    return config;
}