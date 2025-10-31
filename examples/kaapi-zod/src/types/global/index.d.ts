import { KaapiServerRoute, HandlerDecorations, Lifecycle } from '@kaapi/kaapi';
import { z, ZodType } from 'zod/v4';
import { ParseContext, $ZodIssue } from 'zod/v4/core'

type ZodSchema = ZodType<any, any> | undefined | null;

type ReqSchema = {
  payload?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
  options?: ParseContext<$ZodIssue>
};

declare module '@kaapi/kaapi' {
  interface PluginSpecificConfiguration {
    zod?: {
      payload?: ZodSchema;
      query?: ZodSchema;
      params?: ZodSchema;
      headers?: ZodSchema;
    };
  }

  interface Server {
    routeSafe<RS extends ReqSchema, Refs extends {
      Query: z.infer<RS['query']>;
      Headers: z.infer<RS['headers']>;
      Params: z.infer<RS['params']>;
      Payload: z.infer<RS['payload']>;
    }>(serverRoute: KaapiServerRoute<Refs>, schema?: RS, handler?: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>): this;
  }
}


export { };