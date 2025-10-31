import Boom from '@hapi/boom';
import { KaapiServerRoute, HandlerDecorations, Lifecycle, KaapiPlugin, Request, ResponseToolkit, KaapiOpenAPIHelperInterface } from '@kaapi/kaapi';
import { z, ZodType } from 'zod/v4'
import { ParseContext, $ZodIssue } from 'zod/v4/core'
import { fromError } from 'zod-validation-error/v4';
import { OpenAPIZodHelper, PostmanZodHelper } from '@novice1/api-doc-zod-helper';

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

class CustomZodHelper extends OpenAPIZodHelper implements KaapiOpenAPIHelperInterface {
    isFile() {
        const children = this.getChildren()
        const dataType = children._data?.getType()
        return dataType === 'custom'
    }

    getRawSchema() {
        return this._schema
    }

    getFilesChildren(): Record<string, typeof this._schema> {
        const r: Record<string, typeof this._schema> = {};
        if (!this.isValid()) {
            return r;
        }
        const schema = this.getMostInnerType()
        if (schema?.def) {
            if ('shape' in schema.def && typeof schema.def.shape === 'object' && schema.def.shape) {
                const properties: Record<string, unknown> = schema.def.shape as Record<string, unknown>
                for (const p in properties) {
                    const ch = new CustomZodHelper({ value: properties[p] })
                    if (ch.isValid() && ch.isFile())
                        r[p] = ch.getRawSchema()
                }
            }
        }
        return r;
    }
}

export type ZodSchema = ZodType<any, any> | undefined | null;

export type ReqSchema = {
    payload?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
    headers?: ZodSchema;
    state?: ZodSchema;
    options?: ParseContext<$ZodIssue>
}

export const kaapiZodDocs = {
    openAPIOptions: {
        helperClass: OpenAPIZodHelper
    },
    postmanOptions: {
        helperClass: PostmanZodHelper
    }
}

export const kaapiZodValidator: KaapiPlugin = {
    async integrate(t) {
        const routeSafe = <
            RS extends ReqSchema,
            Refs extends {
                Query: z.infer<RS['query']>,
                Headers: z.infer<RS['headers']>
                Params: z.infer<RS['params']>
                Payload: z.infer<RS['payload']>
            }>(
                serverRoute: KaapiServerRoute<Refs>,
                schema?: RS,
                handler?: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>
            ) => {
            if (!serverRoute.options) {
                serverRoute.options = {}
            }
            if (typeof serverRoute.options === 'object') {
                // validate
                if (!serverRoute.options.plugins) {
                    serverRoute.options.plugins = {}
                }
                serverRoute.options.plugins.zod = schema

                // docs
                serverRoute.options.plugins.kaapi = serverRoute.options.plugins.kaapi || {}
                if (serverRoute.options.plugins.kaapi.docs != false && // docs not disabled
                    !serverRoute.options.plugins.kaapi.docs?.disabled // docs not disabled
                ) {
                    if (!serverRoute.options.plugins?.kaapi?.docs?.helperSchemaProperty) // docs have not helperSchemaProperty
                        serverRoute.options.plugins.kaapi.docs = { ...serverRoute.options.plugins.kaapi.docs, helperSchemaProperty: 'zod' }
                    if (!serverRoute.options.plugins?.kaapi?.docs?.openAPIHelperClass) // docs have not openAPIHelperClass
                        serverRoute.options.plugins.kaapi.docs = { ...serverRoute.options.plugins.kaapi.docs, openAPIHelperClass: CustomZodHelper }
                }
            }
            return t.route(
                serverRoute,
                handler
            )
        }
        await t.server.register({
            name: 'kaapi-zod-validator',
            version: '1.0.0',
            register: async function (server) {
                server.ext('onPreHandler', async (request: Request, h: ResponseToolkit) => {
                    const routeValidation = request?.route?.settings?.plugins?.zod as ReqSchema;

                    try {

                        // Adding loop so that in future adding in array will be enough
                        for (const prop of supportedProps) {
                            if (routeValidation?.[prop] && parse[prop]) {
                                if (prop === 'query') {
                                    const parsedProp = routeValidation[prop].parse(normalizeBooleans(request[prop]), routeValidation.options);
                                    Object.assign(request, { [prop]: parsedProp });
                                }
                                else {
                                    const parsedProp = routeValidation[prop].parse(request[prop], routeValidation.options);
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
                server.decorate('server', 'routeSafe', routeSafe)
            },
        })
    },
}

export default kaapiZodValidator