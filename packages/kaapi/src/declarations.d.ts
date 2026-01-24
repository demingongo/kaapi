import '@hapi/hapi'
import type { KaapiPluginConfiguration, AbstractKaapiApp } from './abstract-app';

declare module '@hapi/hapi' {
  interface PluginSpecificConfiguration {
    kaapi?: KaapiPluginConfiguration;
    [x: string]: unknown;
  }

  interface Request {
    publish: AbstractKaapiApp['publish'];
  }
}

export { }