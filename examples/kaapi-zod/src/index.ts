/* eslint-disable @typescript-eslint/no-explicit-any */
import { Kaapi, ResponseToolkit, Request, KaapiServerRoute, HandlerDecorations, Lifecycle } from '@kaapi/kaapi';
import { z, ZodType } from 'zod/v4'
import Boom from '@hapi/boom'
import { fromError } from 'zod-validation-error/v4';
import Joi from 'joi'
import { BearerUtil } from '@novice1/api-doc-generator';

type ZodSchema = ZodType<any, any> | undefined | null;

const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
    },
    auth: {
        tokenType: 'Bearer',
        validate: async (_, token) => {
            const isValid = token == 'alain'
            const credentials = isValid ? { user: { username: 'Alain' } } : undefined
            return {
                isValid,
                credentials,
                message: credentials ? 'ok' : 'Unauthorized!'
            }
        },
    },
    docs: {
        security: new BearerUtil('mySecurityScheme')
    }
})

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
app.idle().server.register({
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
                app.log.error(error);
                return Boom.badRequest(error);
            }
        });
    },
})

type ReqSchema = {
    payload?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
    headers?: ZodSchema;
    state?: ZodSchema;
}

function myway<
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
    return app.route(
        serverRoute,
        handler
    )
}
app.idle().server.decorate('server', 'myway', myway);

//app.myway = myway

const schema = {
    query: z.object({
        name: z.string()
    })
}

//type QueryType = z.infer<typeof schema.query>

app.server().route(
    {
        path: '/zod',
        auth: false,
        method: 'GET',
        options: {
            plugins: {
                zod: schema,
                kaapi: {
                docs: false
            }
            }
        }
    },
    (req) => req.query
)

myway({
    path: '/oops',
    method: 'POST',
    auth: true,
    options: {
        plugins: {
            kaapi: {
                docs: {
                    disabled: false
                }
            }
        },
        validate: {
            query: Joi.object({
                version: Joi.number()
            })
        }
    }
}, {
    payload: z.object({
        message: z.string().nonempty().max(5120)
    })
}, ({ payload: { message } }) => `${message}`)

app.refreshDocs()