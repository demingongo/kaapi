import { ZodType } from 'zod/v4';
type ZodSchema = ZodType<any, any> | undefined | null; 

declare module '@kaapi/kaapi' {
  interface PluginSpecificConfiguration {
    zod?: {
      payload?: ZodSchema;
      query?: ZodSchema;
      params?: ZodSchema;
      headers?: ZodSchema;
      state?: ZodSchema;
    };
  }
}


export { };