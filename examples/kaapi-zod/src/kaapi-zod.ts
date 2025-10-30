import Boom from '@hapi/boom';
import { Kaapi, KaapiServerRoute, HandlerDecorations, Lifecycle, KaapiPlugin, Request, ResponseToolkit } from '@kaapi/kaapi';
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
        RS extends ReqSchema,
        Refs extends {
            Query: z.infer<RS['query']>,
            Headers: z.infer<RS['headers']>
            Params: z.infer<RS['params']>
            Payload: z.infer<RS['payload']>
            Pres: z.infer<RS['state']>
        }>(
            serverRoute: KaapiServerRoute<Refs>,
            schema: RS,
            handler: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>
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
}