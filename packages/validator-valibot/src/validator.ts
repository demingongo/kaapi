import Boom from '@hapi/boom';
import { objectAsync, type ObjectEntriesAsync, parseAsync, ValiError } from 'valibot'
import type { KaapiServerRoute, HandlerDecorations, Lifecycle, KaapiPlugin, Request, ResponseToolkit, RouteOptions } from '@kaapi/kaapi';
import type { ValibotlessReqRef, ValibotlessReqRefDefaults, ValidatorValibot, ValidatorValibotReqRef, ValidatorValibotRouteBuilder, ValidatorValibotSchema } from './types';
import { OpenAPIValibotHelper, PostmanValibotHelper } from './doc-helpers';
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

function mergeOptions<V extends ValidatorValibotSchema, R extends ValibotlessReqRef>(
    options: RouteOptions<ValidatorValibotReqRef<V> & R>,
    schema: V
) {
    // validator
    if (!options.plugins) {
        options.plugins = {}
    }
    options.plugins.valibot = schema

    // docs
    options.plugins.kaapi = options.plugins.kaapi || {}
    if (options.plugins.kaapi.docs != false && // docs not disabled
        !options.plugins.kaapi.docs?.disabled // docs not disabled
    ) {
        if (!options.plugins?.kaapi?.docs?.helperSchemaProperty) // docs have not helperSchemaProperty
            options.plugins.kaapi.docs = { ...options.plugins.kaapi.docs, helperSchemaProperty: 'valibot' }
        if (!options.plugins?.kaapi?.docs?.openAPIHelperClass) // docs have not openAPIHelperClass
            options.plugins.kaapi.docs = { ...options.plugins.kaapi.docs, openAPIHelperClass: OpenAPIValibotHelper }
    }
    return options
}

export const withSchema = function withSchema<V extends ValidatorValibotSchema>(schema: V): ValidatorValibotRouteBuilder<V> {
    return {
        route<R extends ValibotlessReqRef = ValibotlessReqRefDefaults>(
            serverRoute: KaapiServerRoute<ValidatorValibotReqRef<V> & R>,
            handler?: HandlerDecorations | Lifecycle.Method<ValidatorValibotReqRef<V> & R, Lifecycle.ReturnValue<ValidatorValibotReqRef<V> & R>>
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

export const validatorValibot: KaapiPlugin = {
    async integrate(t) {
        const validator: ValidatorValibot = <V extends ValidatorValibotSchema>(schema: V) => {
            const builder = withSchema(schema)
            return {
                route<R extends ValibotlessReqRef = ValibotlessReqRefDefaults>(
                    serverRoute: KaapiServerRoute<ValidatorValibotReqRef<V> & R>,
                    handler?: HandlerDecorations | Lifecycle.Method<ValidatorValibotReqRef<V> & R, Lifecycle.ReturnValue<ValidatorValibotReqRef<V> & R>>
                ) {
                    t.route(builder.route(
                        serverRoute,
                        handler
                    ));
                    return t.server;
                }
            };
        };

        await t.server.register({
            name: 'kaapi-validator-valibot',
            version: pkg.version,
            register: async function (server) {
                server.ext('onPreHandler', async (request: Request, h: ResponseToolkit) => {
                    const routeValidation = request?.route?.settings?.plugins?.valibot as ValidatorValibotSchema | undefined;
                    try {
                        // Initialize empty objects to hold the parsed data and corresponding Valibot schemas
                        const data: Record<string, unknown> = {};
                        const dataSchema: ObjectEntriesAsync = {};

                        // Loop through all supported properties for this route
                        for (const prop of supportedProps) {
                            // Check if validation exists for this property and there is a parser defined
                            if (routeValidation?.[prop] && parse[prop]) {
                                // Add the Valibot schema for this property to the dataSchema
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

                        // If we have any props to validate, parse them using Valibot
                        if (hasProps) {
                            // Create a Valibot object from the collected schema and parse asynchronously
                            // Options can come from routeValidation.options
                            const parsedProps = await parseAsync(objectAsync(dataSchema), data, routeValidation?.options);
                            // Merge the parsed and validated properties back into the request object
                            Object.assign(request, parsedProps);
                        }

                        // Continue the Hapi request lifecycle
                        return h.continue;
                    } catch (err) {
                        // Initialize a set to track which paths (properties) failed validation
                        const issuePaths = new Set<string>();
                        let message: string;

                        // Check if the error is instance of ValiError
                        if (err instanceof ValiError && err.issues.length) {
                            const firstIssue = err.issues[0];
                            message = firstIssue.message;
                            // Track which property caused the issue
                            if (Array.isArray(firstIssue.path) && firstIssue.path.length) {
                                let errorPath = '';
                                for (const p of firstIssue.path) {
                                    if (p && typeof p.key === 'string') {
                                        errorPath += `.${p.key}`;
                                    }
                                }
                                if (errorPath.length) {
                                    message += ` at "${errorPath.substring(1)}"`;
                                }
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
                            request.log(['validation', 'error', 'valibot', ...issuePaths], response);
                            // Note: unlike Hapi's failAction 'log', 'log' here still returns a Boom response
                        }

                        // Return the error response to halt request processing
                        return response;
                    }
                });
                server.decorate('server', 'valibot', validator)
            },
        });

        if (t.openapi) {
            t.openapi.addHelperClass(OpenAPIValibotHelper);
        }
        if (t.postman) {
            t.postman.addHelperClass(PostmanValibotHelper);
        }
    },
}