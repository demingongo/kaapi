import Boom from '@hapi/boom';
import { z } from 'zod/v4';
import { $ZodIssue } from 'zod/v4/core';
import { KaapiServerRoute, HandlerDecorations, Lifecycle, KaapiPlugin, Request, ResponseToolkit, KaapiOpenAPIHelperInterface, RouteOptions } from '@kaapi/kaapi';
import { OpenAPIZodHelper, PostmanZodHelper } from '@novice1/api-doc-zod-helper';
import type { ValidatorZod, ValidatorZodReqRef, ValidatorZodRouteBuilder, ValidatorZodSchema, ZodlessReqRef, ZodlessReqRefDefaults, ZodSchema } from './types';
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

function mergeOptions<V extends ValidatorZodSchema, R extends ZodlessReqRef>(
    options: RouteOptions<ValidatorZodReqRef<V> & R>,
    schema: V
) {
    // validator
    if (!options.plugins) {
        options.plugins = {}
    }
    options.plugins.zod = schema

    // docs
    options.plugins.kaapi = options.plugins.kaapi || {}
    if (options.plugins.kaapi.docs != false && // docs not disabled
        !options.plugins.kaapi.docs?.disabled // docs not disabled
    ) {
        if (!options.plugins?.kaapi?.docs?.helperSchemaProperty) // docs have not helperSchemaProperty
            options.plugins.kaapi.docs = { ...options.plugins.kaapi.docs, helperSchemaProperty: 'zod' }
        if (!options.plugins?.kaapi?.docs?.openAPIHelperClass) // docs have not openAPIHelperClass
            options.plugins.kaapi.docs = { ...options.plugins.kaapi.docs, openAPIHelperClass: ZodDocHelper }
    }
    return options
}

export const withSchema = function withSchema<V extends ValidatorZodSchema>(schema: V): ValidatorZodRouteBuilder<V> {
    return {
        route<R extends ZodlessReqRef = ZodlessReqRefDefaults>(
            serverRoute: KaapiServerRoute<ValidatorZodReqRef<V> & R>,
            handler?: HandlerDecorations | Lifecycle.Method<ValidatorZodReqRef<V> & R, Lifecycle.ReturnValue<ValidatorZodReqRef<V> & R>>
        ) {
            const { ...route } = serverRoute
            if (!route.options) {
                route.options = {}
            }
            if (typeof route.options === 'object') {
                mergeOptions(route.options, schema)
            } else if (typeof route.options === 'function') {
                const fn = route.options.bind(route);
                route.options = (server) => {
                    const options = fn(server)
                    return mergeOptions(options, schema)
                }
            }
            if (handler) {
                route.handler = handler
            }
            return route
        }
    }
}

export const validatorZod: KaapiPlugin = {
    async integrate(t) {
        const validator: ValidatorZod = <V extends ValidatorZodSchema>(schema: V) => {
            const builder = withSchema(schema)
            return {
                route<R extends ZodlessReqRef = ZodlessReqRefDefaults>(
                    serverRoute: KaapiServerRoute<ValidatorZodReqRef<V> & R>,
                    handler?: HandlerDecorations | Lifecycle.Method<ValidatorZodReqRef<V> & R, Lifecycle.ReturnValue<ValidatorZodReqRef<V> & R>>
                ) {
                    t.route(builder.route(
                        serverRoute,
                        handler
                    ))
                    return t.server
                }
            };
        };

        await t.server.register({
            name: 'kaapi-validator-zod',
            version: pkg.version,
            register: async function (server) {
                server.ext('onPreHandler', async (request: Request, h: ResponseToolkit) => {
                    const routeValidation = request?.route?.settings?.plugins?.zod as ValidatorZodSchema | undefined;
                    try {
                        // Initialize empty objects to hold the parsed data and corresponding Zod schemas
                        const data: Record<string, unknown> = {};
                        const dataSchema: Record<string, ZodSchema> = {};

                        // Loop through all supported properties for this route
                        for (const prop of supportedProps) {
                            // Check if validation exists for this property and there is a parser defined
                            if (routeValidation?.[prop] && parse[prop]) {
                                // Add the Zod schema for this property to the dataSchema
                                dataSchema[prop] = routeValidation[prop];
                                // Prepare the value for parsing:
                                // - For query params, normalize boolean strings to actual booleans
                                // - Otherwise, take the raw value from the request object
                                data[prop] = prop === 'query' ? normalizeBooleans(request[prop]) : request[prop];
                            }
                        }

                        // Determine if there are any properties to validate
                        let hasProps = false;
                        for (const key in dataSchema) {
                            // Safely check own properties to avoid inherited keys
                            if (Object.prototype.hasOwnProperty.call(dataSchema, key)) {
                                hasProps = true;
                                break;
                            }
                        }

                        // If we have any props to validate, parse them using Zod
                        if (hasProps) {
                            // Create a Zod object from the collected schema and parse asynchronously
                            // Options (like error maps or jitless) can come from routeValidation.options
                            const parsedProps = await z.object(dataSchema).parseAsync(data, routeValidation?.options);
                            // Merge the parsed and validated properties back into the request object
                            Object.assign(request, parsedProps);
                        }

                        // Continue the Hapi request lifecycle
                        return h.continue;
                    } catch (err) {
                        // Initialize a set to track which paths (properties) failed validation
                        const issuePaths = new Set<string>();
                        let message: string;

                        // Check if the error is a Zod validation error
                        if (err instanceof Object &&
                            'name' in err &&
                            (err.name === 'ZodError' || err.name === '$ZodError') &&
                            'issues' in err &&
                            Array.isArray(err.issues)) {
                            const zodIssues = err.issues;
                            if (zodIssues.length !== 0) {
                                // Build a single error message string from all Zod issues
                                message = zodIssues
                                    .map((issue: $ZodIssue) => {
                                        // Track which property caused the issue
                                        if (Array.isArray(issue.path) && issue.path.length !== 0) {
                                            const key = issue.path[0]
                                            if (typeof key === 'symbol') {
                                                if (key.description) {
                                                    issuePaths.add(key.description)
                                                }
                                            } else {
                                                issuePaths.add(String(key))
                                            }
                                        }
                                        // Map the issue to a human-readable string
                                        return mapIssue(issue)
                                    })
                                    .join('; ');
                            } else {
                                // Fallback if no issues array exists (rare)
                                message = 'message' in err && typeof err.message === 'string' ? err.message : '';
                            }
                        } else if (err instanceof Error) {
                            // If it’s a regular Error, use its message
                            message = err.message
                        } else {
                            // Unknown error type
                            message = 'Unknown error'
                        }

                        // Create a Boom badRequest response with the error message
                        const response = Boom.badRequest(message);

                        // Attach the raw validation error object for debugging/logging
                        response.data = {
                            validationError: err
                        }

                        // Handle custom failAction if it’s a function
                        if (typeof routeValidation?.failAction === 'function') {
                            return routeValidation.failAction(request, h, response)
                        }

                        // If failAction is 'log', log the validation error with the request
                        if (routeValidation?.failAction === 'log') {
                            request.log(['validation', 'error', 'zod', ...issuePaths], response);
                            // Note: unlike Hapi's failAction 'log', 'log' here still returns a Boom response
                        }

                        // Return the error response to halt request processing
                        return response;
                    }
                });
                server.decorate('server', 'zod', validator)
            },
        });

        if (t.openapi) {
            t.openapi.addHelperClass(zodDocsConfig.openAPIOptions.helperClass);
        }
        if (t.postman) {
            t.postman.addHelperClass(zodDocsConfig.postmanOptions.helperClass);
        }
    },
}
