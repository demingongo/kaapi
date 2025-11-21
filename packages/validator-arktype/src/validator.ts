import pkg from '../package.json' with { type: 'json' };
import { OpenAPIArkHelper, PostmanArkHelper } from './doc-helpers.js';
import type {
    ArklessReqRef,
    ArklessReqRefDefaults,
    ValidatorArk,
    ValidatorArkReqRef,
    ValidatorArkSchema,
} from './types.js';
import Boom from '@hapi/boom';
import type {
    KaapiServerRoute,
    HandlerDecorations,
    Lifecycle,
    KaapiPlugin,
    Request,
    ResponseToolkit,
    RouteOptions,
} from '@kaapi/kaapi';
import { type, type Type } from 'arktype';

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
};

function mergeOptions<V extends ValidatorArkSchema, R extends ArklessReqRef>(
    options: RouteOptions<ValidatorArkReqRef<V> & R>,
    schema: V
) {
    // validator
    if (!options.plugins) {
        options.plugins = {};
    }
    options.plugins.ark = schema;

    // docs
    options.plugins.kaapi = options.plugins.kaapi || {};
    if (
        options.plugins.kaapi.docs != false && // docs not disabled
        !options.plugins.kaapi.docs?.disabled // docs not disabled
    ) {
        if (!options.plugins?.kaapi?.docs?.helperSchemaProperty)
            // docs have not helperSchemaProperty
            options.plugins.kaapi.docs = {
                ...options.plugins.kaapi.docs,
                helperSchemaProperty: 'ark',
            };
        if (!options.plugins?.kaapi?.docs?.openAPIHelperClass)
            // docs have not openAPIHelperClass
            options.plugins.kaapi.docs = {
                ...options.plugins.kaapi.docs,
                openAPIHelperClass: OpenAPIArkHelper,
            };
    }
    return options
}

export const validatorArk: KaapiPlugin = {
    async integrate(t) {
        const validator: ValidatorArk = <V extends ValidatorArkSchema>(schema: V) => {
            return {
                route<R extends ArklessReqRef = ArklessReqRefDefaults>(
                    serverRoute: KaapiServerRoute<ValidatorArkReqRef<V> & R>,
                    handler?:
                        | HandlerDecorations
                        | Lifecycle.Method<ValidatorArkReqRef<V> & R, Lifecycle.ReturnValue<ValidatorArkReqRef<V> & R>>
                ) {
                    if (!serverRoute.options) {
                        serverRoute.options = {};
                    }
                    if (typeof serverRoute.options === 'object') {
                        mergeOptions(serverRoute.options, schema)
                    } else if (typeof serverRoute.options === 'function') {
                        const fn = serverRoute.options.bind(serverRoute);
                        serverRoute.options = (server) => {
                            const options = fn(server)
                            return mergeOptions(options, schema)
                        }
                    }
                    t.route(serverRoute, handler);
                    return t.server;
                },
            };
        };

        await t.server.register({
            name: 'kaapi-validator-arktype',
            version: pkg.version,
            register: async function (server) {
                server.ext('onPreHandler', async (request: Request, h: ResponseToolkit) => {
                    const routeValidation = request?.route?.settings?.plugins?.ark as ValidatorArkSchema | undefined;
                    try {
                        // Initialize empty objects to hold the parsed data and corresponding ArkType schemas
                        const data: Record<string, unknown> = {};
                        const dataSchema: Record<string, Type> = {};

                        // Loop through all supported properties for this route
                        for (const prop of supportedProps) {
                            // Check if validation exists for this property and there is a parser defined
                            if (routeValidation?.[prop] && parse[prop]) {
                                // Add the ArkType schema for this property to the dataSchema
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

                        // If we have any props to validate, parse them using ArkType
                        if (hasProps) {
                            // Create an ArkType object from the collected schema and parse
                            const parsedProps = type(dataSchema)(data);
                            if (parsedProps instanceof type.errors) {
                                // throw ArkErrors
                                throw parsedProps;
                            }
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
                        if (err instanceof type.errors && err.issues.length) {
                            const firstIssue = err.issues[0];
                            message = firstIssue.message;
                        } else if (err instanceof Error) {
                            // If it’s a regular Error, use its message
                            message = err.message;
                        } else {
                            // Unknown error type
                            message = 'Unknown error';
                        }

                        // Create a Boom badRequest response with the error message
                        const response = Boom.badRequest(message);

                        // Attach the raw validation error object for debugging/logging
                        response.data = {
                            validationError: err,
                        };

                        // Handle custom failAction if it’s a function
                        if (typeof routeValidation?.failAction === 'function') {
                            return routeValidation.failAction(request, h, response);
                        }

                        // If failAction is 'log', log the validation error with the request
                        if (routeValidation?.failAction === 'log') {
                            request.log(['validation', 'error', 'arktype', ...issuePaths], response);
                            // Note: unlike Hapi's failAction 'log', 'log' here still returns a Boom response
                        }

                        // Return the error response to halt request processing
                        return response;
                    }
                });
                server.decorate('server', 'ark', validator);
            },
        });

        if (t.openapi) {
            t.openapi.addHelperClass(OpenAPIArkHelper);
        }
        if (t.postman) {
            t.postman.addHelperClass(PostmanArkHelper);
        }
    },
};
