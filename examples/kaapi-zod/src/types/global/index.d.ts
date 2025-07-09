/* eslint-disable @typescript-eslint/no-explicit-any */
import { ZodType } from 'zod/v4';
type ZodSchema = ZodType<any, any> | undefined | null; 

declare module '@hapi/hapi' {
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