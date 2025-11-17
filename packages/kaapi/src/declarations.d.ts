import '@hapi/hapi'
import type { RequestBodyAdapter } from './services/docs/doc-adapters'
import type { KaapiOpenAPIHelperClass } from './services/docs/generators'

declare module '@hapi/hapi' {
  interface PluginSpecificConfiguration {
    kaapi?: {
      docs?: {
        disabled?: boolean;
        openAPIHelperClass?: KaapiOpenAPIHelperClass;
        helperSchemaProperty?: string;
        openApiSchemaExtension?: object;
        adapters?: {
          requestBody?: RequestBodyAdapter
        }
      } | false
    };
    [x: string]: unknown;
  }
}

export { }