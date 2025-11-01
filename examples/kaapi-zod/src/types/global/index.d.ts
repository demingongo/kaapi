import { KaapiServerRoute, HandlerDecorations, Lifecycle, ReqRefDefaults, ReqRef } from '@kaapi/kaapi';
import { z, ZodType } from 'zod/v4';
import { ParseContext, $ZodIssue } from 'zod/v4/core'

type ZodSchema = ZodType<any, any> | undefined | null;

type ZodValidate = {
  payload?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
  options?: ParseContext<$ZodIssue>
};

interface ValidatorReqRef<RS extends ZodValidate = ZodValidate> {
  Query: z.infer<RS['query']>,
  Headers: z.infer<RS['headers']>
  Params: z.infer<RS['params']>
  Payload: z.infer<RS['payload']>
}

type ZodReqRefDefaults = Omit<ReqRefDefaults, 'Query' | 'Headers' | 'Params' | 'Payload'>;
type ZodReqRef = Omit<ReqRef, 'Query' | 'Headers' | 'Params' | 'Payload'>;

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
    zod<RS extends ZodValidate>(schema: RS): {
      route<R extends ZodReqRef = ZodReqRefDefaults>(
        serverRoute: KaapiServerRoute<ValidatorReqRef<RS> & R>,
        handler?: HandlerDecorations | Lifecycle.Method<ValidatorReqRef<RS> & R, Lifecycle.ReturnValue<ValidatorReqRef<RS> & R>>
      ): Server;
    }
  }
}

export { }