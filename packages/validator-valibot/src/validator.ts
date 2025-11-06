import Boom from '@hapi/boom';
import { objectAsync, ObjectEntriesAsync, parseAsync } from 'valibot'
import { KaapiServerRoute, HandlerDecorations, Lifecycle, KaapiPlugin, Request, ResponseToolkit } from '@kaapi/kaapi';
import { ValibotlessReqRef, ValibotlessReqRefDefaults, ValidatorValibot, ValidatorValibotReqRef, ValidatorValibotSchema } from './types';
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

export const validatorValibot: KaapiPlugin = {
    async integrate(t) {
        const validator: ValidatorValibot = <V extends ValidatorValibotSchema>(schema: V) => {
            return {
                route<R extends ValibotlessReqRef = ValibotlessReqRefDefaults>(
                    serverRoute: KaapiServerRoute<ValidatorValibotReqRef<V> & R>,
                    handler?: HandlerDecorations | Lifecycle.Method<ValidatorValibotReqRef<V> & R, Lifecycle.ReturnValue<ValidatorValibotReqRef<V> & R>>
                ) {
                    if (!serverRoute.options) {
                        serverRoute.options = {}
                    }
                    if (typeof serverRoute.options === 'object') {
                        // validate
                        if (!serverRoute.options.plugins) {
                            serverRoute.options.plugins = {}
                        }
                        serverRoute.options.plugins.valibot = schema

                        // docs
                        serverRoute.options.plugins.kaapi = serverRoute.options.plugins.kaapi || {}
                        if (serverRoute.options.plugins.kaapi.docs != false && // docs not disabled
                            !serverRoute.options.plugins.kaapi.docs?.disabled // docs not disabled
                        ) {
                            if (!serverRoute.options.plugins?.kaapi?.docs?.helperSchemaProperty) // docs have not helperSchemaProperty
                                serverRoute.options.plugins.kaapi.docs = { ...serverRoute.options.plugins.kaapi.docs, helperSchemaProperty: 'valibot' }
                            if (!serverRoute.options.plugins?.kaapi?.docs?.openAPIHelperClass) // docs have not openAPIHelperClass
                                serverRoute.options.plugins.kaapi.docs = { ...serverRoute.options.plugins.kaapi.docs, /*openAPIHelperClass: ZodDocHelper*/ }
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
                            // Options (like error maps or jitless) can come from routeValidation.options
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

                        // Check if the error is a Zod validation error
                        /*
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
                        */
                        console.log(err)
                        if (err instanceof Error) {
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

        //if (t.openapi) {
        //    t.openapi.addHelperClass(zodDocsConfig.openAPIOptions.helperClass);
        //}
        //if (t.postman) {
        //    t.postman.addHelperClass(zodDocsConfig.postmanOptions.helperClass);
        //}
    },
}