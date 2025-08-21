import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'url';
import * as prompts from '@clack/prompts';
import { Config } from './definitions';

export async function loadKaapiConfig(silent?: boolean): Promise<Config> {
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
        if(!silent) prompts.log.warn('No kaapi config file found.');
        return {}
    }

    // Support both CommonJS and ESM exports
    const configModulePath = path.resolve(configPath);
    const configModuleUrl = pathToFileURL(configModulePath).href;
    const configModule = await import(configModuleUrl);
    const config = configModule.default || configModule;

    if(!silent) prompts.log.info(`Loaded kaapi config: ${configPath}`)

    return config;
}