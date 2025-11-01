import Boom from '@hapi/boom';
import { KaapiServerRoute, HandlerDecorations, Lifecycle, KaapiPlugin, Request, ResponseToolkit, KaapiOpenAPIHelperInterface } from '@kaapi/kaapi';
import { OpenAPIZodHelper, PostmanZodHelper } from '@novice1/api-doc-zod-helper';
import type { KaapiReqRefDefaultsSubset, KaapiReqRefSubset, ValidatorZod, ValidatorZodReqRef, ValidatorZodSchema } from './types';
import { mapIssue } from './utils';
import pkg from '../package.json';

const { parse = { payload: true, query: true, params: true, headers: true, state: true } } = {};
export const supportedProps = ['payload', 'query', 'params', 'headers', 'state'] as const;
const normalizeBooleans = (obj: Record<string, unknown>) => {
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

export class ZodDocHelper extends OpenAPIZodHelper implements KaapiOpenAPIHelperInterface {
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
                    const ch = new ZodDocHelper({ value: properties[p] })
                    if (ch.isValid() && ch.isFile())
                        r[p] = ch.getRawSchema()
                }
            }
        }
        return r;
    }
}

export const zodDocsConfig = {
    openAPIOptions: {
        helperClass: OpenAPIZodHelper
    },
    postmanOptions: {
        helperClass: PostmanZodHelper
    }
}

export const validatorZod: KaapiPlugin = {
    async integrate(t) {
        const validator: ValidatorZod = <V extends ValidatorZodSchema>(schema: V) => {
            return {
                route<R extends KaapiReqRefSubset = KaapiReqRefDefaultsSubset>(
                    serverRoute: KaapiServerRoute<ValidatorZodReqRef<V> & R>,
                    handler?: HandlerDecorations | Lifecycle.Method<ValidatorZodReqRef<V> & R, Lifecycle.ReturnValue<ValidatorZodReqRef<V> & R>>
                ) {
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
                                serverRoute.options.plugins.kaapi.docs = { ...serverRoute.options.plugins.kaapi.docs, openAPIHelperClass: ZodDocHelper }
                        }
                    }
                    t.route(
                        serverRoute,
                        handler
                    )
                    return t.server
                }
            };
        };

        await t.server.register({
            name: 'kaapi-validator-zod',
            version: pkg.version,
            register: async function (server) {
                server.ext('onPreHandler', async (request: Request, h: ResponseToolkit) => {
                    const routeValidation = request?.route?.settings?.plugins?.zod as ValidatorZodSchema;
                    try {
                        // loop through supported props
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
                        let message: string;
                        if (err instanceof Object &&
                            'name' in err &&
                            (err.name === 'ZodError' || err.name === '$ZodError') &&
                            'issues' in err &&
                            Array.isArray(err.issues)) {
                            const zodIssues = err.issues;
                            if (zodIssues.length !== 0) {
                                message = zodIssues
                                    .map((issue) => mapIssue(issue))
                                    .join('; ');
                            } else {
                                message = 'message' in err && typeof err.message === 'string' ? err.message : '';
                            }
                        } else if (err instanceof Error) {
                            message = err.message
                        } else {
                            message = 'Unknown error'
                        }
                        t.log.debug(message);
                        return Boom.badRequest(message);
                    }
                });
                server.decorate('server', 'zod', validator)
            },
        })
    },
}
