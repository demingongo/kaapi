import '@hapi/hapi'
import { OpenAPIHelperInterface } from '@novice1/api-doc-generator'

interface KaapiOpenAPIHelperInterface extends OpenAPIHelperInterface {
  isFile(): boolean | undefined;
  getFilesChildren(): Record<string, unknown>;
}

type KaapiOpenAPIHelperClass = {
  new(args: {
    isRoot?: boolean;
    value: unknown;
  }): KaapiOpenAPIHelperInterface;
}

declare module '@hapi/hapi' {
  interface PluginSpecificConfiguration {
    kaapi?: {
      docs?: {
        disabled?: boolean;
        story?: string;
        openAPIHelperClass?: KaapiOpenAPIHelperClass;
        helperSchemaProperty?: string;
      } | false
    };
    [x: string]: unknown;
  }
}

export { }