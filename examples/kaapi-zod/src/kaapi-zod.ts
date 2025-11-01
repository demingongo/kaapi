import Boom from '@hapi/boom';
import { Kaapi, KaapiServerRoute, HandlerDecorations, Lifecycle, KaapiPlugin, Request, ResponseToolkit, ReqRefDefaults, ReqRef } from '@kaapi/kaapi';
import { z, ZodType } from 'zod/v4'
import { fromError } from 'zod-validation-error/v4';

export type ZodSchema = ZodType<any, any> | undefined | null;

export type ReqSchema = {
    payload?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
    headers?: ZodSchema;
    state?: ZodSchema;
}

export interface SubReqRef<RS extends ReqSchema = ReqSchema> {
    Query: z.infer<RS['query']>,
    Headers: z.infer<RS['headers']>
    Params: z.infer<RS['params']>
    Payload: z.infer<RS['payload']>
}

export type ReqRefDefaultsSubset = Omit<ReqRefDefaults, 'Query' | 'Headers' | 'Params' | 'Payload'>;
export type ReqRefSubset = Omit<ReqRef, 'Query' | 'Headers' | 'Params' | 'Payload'>;

const { parse = { payload: true, query: true, params: true, headers: true, state: true } } = {};
const supportedProps = ['payload', 'query', 'params', 'headers', 'state'] as const;
const normalizeBooleans = (obj: Record<string, any>) => {
    for (const key in obj) {
        const val = obj[key];
        if (typeof val === 'string') {
            if (val === 'true') obj[key] = true;
            else if (val === 'false') obj[key] = false;
        } else if (Array.isArray(val)) {
            obj[key] = val.map((v) => (v === 'true' ? true : v === 'false' ? false : v));
        }
    }
    return obj;
}


const plugin: KaapiPlugin = {
    async integrate(t) {
        await t.server.register({
            name: 'zod',
            register(server) {
                server.ext('onPreHandler', async (request: Request, h: ResponseToolkit) => {
                    const routeValidation = request?.route?.settings?.plugins?.zod as {
                        payload?: ZodType<any, any>;
                        query?: ZodType<any, any>;
                        params?: ZodType<any, any>;
                        headers?: ZodType<any, any>;
                        state?: ZodType<any, any>;
                    };

                    try {

                        // Adding loop so that in future adding in array will be enough
                        for (const prop of supportedProps) {
                            if (routeValidation?.[prop] && parse[prop]) {
                                if (prop === 'query') {
                                    const parsedProp = routeValidation[prop].parse(normalizeBooleans(request[prop]));
                                    Object.assign(request, { [prop]: parsedProp });
                                }
                                else {
                                    const parsedProp = routeValidation[prop].parse(request[prop]);
                                    Object.assign(request, { [prop]: parsedProp });
                                }
                            }
                        }

                        return h.continue;
                    } catch (err) {
                        const error = fromError(err).message;
                        t.log.debug(error);
                        return Boom.badRequest(error);
                    }
                });
            },
        })
    },
}


export class KaapiZod extends Kaapi {

    #initialized = false

    async init() {
        if (!this.#initialized) {
            this.#initialized = true
            await this.extend(plugin)
        }
    }

    endpoint<
        R extends ReqRefSubset = ReqRefDefaultsSubset
    >(
        serverRoute: KaapiServerRoute<{
            Query: z.infer<typeof schema['query']>;
            Headers: z.infer<typeof schema['headers']>;
            Params: z.infer<typeof schema['params']>;
            Payload: z.infer<typeof schema['payload']>;
        } & R>,
        schema: {
            payload?: ZodSchema;
            query?: ZodSchema;
            params?: ZodSchema;
            headers?: ZodSchema;
            state?: ZodSchema;
        },
        handler: HandlerDecorations | Lifecycle.Method<{
            Query: z.infer<typeof schema['query']>;
            Headers: z.infer<typeof schema['headers']>;
            Params: z.infer<typeof schema['params']>;
            Payload: z.infer<typeof schema['payload']>;
        } & R, Lifecycle.ReturnValue<{
            Query: z.infer<typeof schema['query']>;
            Headers: z.infer<typeof schema['headers']>;
            Params: z.infer<typeof schema['params']>;
            Payload: z.infer<typeof schema['payload']>;
        } & R>>
    ) {
        if (!serverRoute.options) {
            serverRoute.options = {}
        }
        if (typeof serverRoute.options === 'object') {
            if (!serverRoute.options.plugins) {
                serverRoute.options.plugins = {}
            }
            serverRoute.options.plugins.zod = schema
        }
        return this.route(
            serverRoute,
            handler
        )
    }

    zod<RS extends {
        payload?: ZodSchema;
        query?: ZodSchema;
        params?: ZodSchema;
        headers?: ZodSchema;
        state?: ZodSchema;
    }>(schema: RS) {
        const self = () => this; // ✅ capture class instance
        return {
            route<R extends ReqRefSubset = ReqRefDefaultsSubset>(
                serverRoute: KaapiServerRoute<{
                    Query: z.infer<RS['query']>;
                    Headers: z.infer<RS['headers']>;
                    Params: z.infer<RS['params']>;
                    Payload: z.infer<RS['payload']>;
                } & R>,
                handler: HandlerDecorations | Lifecycle.Method<{
                    Query: z.infer<RS['query']>;
                    Headers: z.infer<RS['headers']>;
                    Params: z.infer<RS['params']>;
                    Payload: z.infer<RS['payload']>;
                } & R, Lifecycle.ReturnValue<{
                    Query: z.infer<RS['query']>;
                    Headers: z.infer<RS['headers']>;
                    Params: z.infer<RS['params']>;
                    Payload: z.infer<RS['payload']>;
                } & R>>
            ): KaapiZod {
                if (!serverRoute.options) {
                    serverRoute.options = {}
                }
                if (typeof serverRoute.options === 'object') {
                    if (!serverRoute.options.plugins) {
                        serverRoute.options.plugins = {}
                    }
                    serverRoute.options.plugins.zod = schema
                }
                self().route(
                    serverRoute,
                    handler
                )
                return self()
            }
        };
    }
}
