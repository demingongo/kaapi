import '@hapi/hapi'
import type { RequestBodyDocsModifier } from './services/docs/docs-modifiers'
import type { KaapiOpenAPIHelperClass } from './services/docs/generators'
import { BaseResponseUtil } from '@novice1/api-doc-generator/lib/utils/responses/baseResponseUtils';

declare module '@hapi/hapi' {
  interface PluginSpecificConfiguration {
    kaapi?: {
      docs?: {
        disabled?: boolean;
        openAPIHelperClass?: KaapiOpenAPIHelperClass;
        helperSchemaProperty?: string;
        modifiers?: {
          requestBody?: RequestBodyDocsModifier;
          responses?: BaseResponseUtil
        }
      } | false
    };
    [x: string]: unknown;
  }
}

export { }