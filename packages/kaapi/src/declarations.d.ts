import '@hapi/hapi'
import type { RequestBodyAdapter } from './services/docs/doc-adapters'
import type { KaapiOpenAPIHelperClass } from './services/docs/generators'
import { BaseResponseUtil } from '@novice1/api-doc-generator/lib/utils/responses/baseResponseUtils';

declare module '@hapi/hapi' {
  interface PluginSpecificConfiguration {
    kaapi?: {
      docs?: {
        disabled?: boolean;
        openAPIHelperClass?: KaapiOpenAPIHelperClass;
        helperSchemaProperty?: string;
        adapters?: {
          requestBody?: RequestBodyAdapter;
          responses?: BaseResponseUtil
        }
      } | false
    };
    [x: string]: unknown;
  }
}

export { }