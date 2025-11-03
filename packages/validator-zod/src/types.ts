import type { ReqRefDefaults, ReqRef, KaapiServerRoute, HandlerDecorations, Lifecycle, Server } from '@kaapi/kaapi'
import { z, type ZodType } from 'zod'
import type { ParseContext, $ZodIssue } from 'zod/v4/core'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ZodSchema = ZodType<any, any> | undefined | null;

export type ValidatorZodOptions = ParseContext<$ZodIssue>

export type ValidatorZodSchema = {
    payload?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
    headers?: ZodSchema;
    state?: ZodSchema;
    options?: ParseContext<$ZodIssue>;
    failAction?: 'error' | 'log' | Lifecycle.Method | undefined;
}

export type ZodlessReqRefDefaults = Omit<ReqRefDefaults, 'Query' | 'Headers' | 'Params' | 'Payload'>;
export type ZodlessReqRef = Omit<ReqRef, 'Query' | 'Headers' | 'Params' | 'Payload'>;

export interface ValidatorZodReqRef<RS extends ValidatorZodSchema = ValidatorZodSchema> {
    Query: z.infer<RS['query']>,
    Headers: z.infer<RS['headers']>
    Params: z.infer<RS['params']>
    Payload: z.infer<RS['payload']>
}

export type ValidatorZod = <V extends ValidatorZodSchema>(schema: V) => {
    route<R extends ZodlessReqRef = ZodlessReqRefDefaults>(
        serverRoute: KaapiServerRoute<ValidatorZodReqRef<V> & R>,
        handler?: HandlerDecorations | Lifecycle.Method<ValidatorZodReqRef<V> & R, Lifecycle.ReturnValue<ValidatorZodReqRef<V> & R>>
    ): Server;
}