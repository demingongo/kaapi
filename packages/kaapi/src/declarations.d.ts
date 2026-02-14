import type { KaapiPluginConfiguration, AbstractKaapiApp } from './abstract-app';
import '@hapi/hapi';

declare module '@hapi/hapi' {
    interface PluginSpecificConfiguration {
        kaapi?: KaapiPluginConfiguration;
        [x: string]: unknown;
    }

    interface Request {
        publish: AbstractKaapiApp['publish'];
    }
}

export {};
