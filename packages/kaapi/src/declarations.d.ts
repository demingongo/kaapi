import '@hapi/hapi'
import type { KaapiPluginConfiguration } from './abstract-app';

declare module '@hapi/hapi' {
  interface PluginSpecificConfiguration {
    kaapi?: KaapiPluginConfiguration;
    [x: string]: unknown;
  }
}

export { }