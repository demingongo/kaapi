
import {
    Kaapi,
    KaapiAuthOptions,
    KaapiPlugin,
    KaapiTools,
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    Request,
    ResponseToolkit,
    ServerAuthScheme
} from '@kaapi/kaapi'
import Boom from '@hapi/boom'
import Hoek from '@hapi/hoek'

import { GrantType, OAuth2Util } from '@novice1/api-doc-generator';


const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    loggerOptions: {
        level: 'debug'
    },
    docs: {
        disabled: false
    }
})

// 404
app.route({}, () => Boom.notFound('Nothing here'))

function buildSignInHTML(options: { title: string, error?: string }) {
    return `<!DOCTYPE html>
<html lang="en">
 <head>
  <meta charset="UTF-8">
  <meta name="Generator" content="EditPlus®">
  <meta name="Author" content="">
  <meta name="Keywords" content="">
  <meta name="Description" content="">
  <title>${options.title}</title>
  <style>
    .error {
      color: red;
      font-weight: bold;
    }
  </style>
 </head>
 <body>
  <form method="POST">
  <div class="error">
    ${options.error || ''}
  </div>
  <div>
  <input type="email" id="email" name="email" placeholder="email" autocomplete="email" />
  <input type="password" id="password" name="password" placeholder="password" />
  </div>
  <div>
  <button type="submit">
    Submit
  </button>
  </div>
  </form>
 </body>
</html>`
}

interface AuthorizationParams {
    clientId: string
    responseType: string
    redirectUri: string
    scope?: string
    state?: string
    codeChallenge?: string
}

type AuthHandler<
    Refs extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    R extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<Refs>
> = (params: AuthorizationParams, request: Request<Refs>, h: ResponseToolkit<Refs>) => R

interface AuthorizationRoute<
    Refs extends ReqRef = ReqRefDefaults,
    PRefs extends ReqRef = ReqRefDefaults,
> {
    path: string,
    handler: AuthHandler<Refs>
    postHandler: AuthHandler<PRefs>
}

class AuthRouteClass implements AuthorizationRoute<{ Query: { nonce?: string } }, { Query: { nonce?: string }, Payload: { email: string, password: string } }> {
    path: string;
    handler: AuthHandler<{ Query: { nonce?: string } }>
    postHandler: AuthHandler<{ Query: { nonce?: string }, Payload: { email: string, password: string } }>

    constructor() {
        this.path = '';
        this.postHandler = async ({ clientId, redirectUri, codeChallenge, scope, state }, { query: { nonce }, payload: { email, password } }, h) => {
            console.log('clientId', clientId)
            console.log('codeChallenge', codeChallenge)
            console.log('redirectUri', redirectUri)
            console.log('scope', scope)
            console.log('state', state)
            console.log('nonce', nonce)

            let error = ''

            if (clientId && email && password) {
                //#region @TODO: validation + code
                const code = 'generated_code'
                if (email == 'user@novice1' && password == '1234') {
                    return h.redirect(`${redirectUri}?code=${code}${state ? `&state=${state}` : ''}`)
                } else {
                    error = 'wrong credentials'
                }
                //#endregion @TODO: validation + code generation
            } else {
                error = 'invalid request'
            }

            // render form
            return h.response(
                buildSignInHTML({
                    title: 'Sign in',
                    error: error || 'something went wrong'
                })
            ).code(200).type('text/html')
        };
        this.handler = async ({ clientId, redirectUri, codeChallenge, scope, state }, { query: { nonce } }, h) => {

            console.log('clientId', clientId)
            console.log('codeChallenge', codeChallenge)
            console.log('redirectUri', redirectUri)
            console.log('scope', scope)
            console.log('state', state)
            console.log('nonce', nonce)

            if (clientId) {
                //#region @TODO: validation

                //#endregion @TODO: validation
            } else {
                return h.response({ error: 'Bad \'client_id\' parameter.' }).code(400)
            }

            // render form
            return h.response(
                buildSignInHTML({
                    title: 'Sign in'
                })
            ).code(200).type('text/html')
        }
    }
}


class MyAuthDesign implements KaapiPlugin {

    protected securitySchemeName: string
    protected description?: string
    protected scopes?: Record<string, string>
    protected options: KaapiAuthOptions

    protected pkce: boolean = false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected authorizationRoute: AuthorizationRoute<any, any>

    constructor(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authorizationRoute: AuthorizationRoute<any, any>,
        options?: KaapiAuthOptions & { securitySchemeName?: string }
    ) {
        this.authorizationRoute = authorizationRoute

        this.securitySchemeName = options?.securitySchemeName || 'auth-design-oauth2'
        this.options = options ? { ...options } : {}
    }

    withPkce(): this {
        this.pkce = true
        return this
    }

    withoutPkce(): this {
        this.pkce = false
        return this
    }

    isWithPkce(): boolean {
        return this.pkce
    }

    setDescription(description: string): this {
        this.description = description;
        return this;
    }

    /**
     * 
     * @param scopes The scopes of the access request.
     * A map between the scope name and a short description for it. The map MAY be empty.
     * @returns 
     */
    setScopes(scopes: Record<string, string>): this {
        this.scopes = scopes;
        return this;
    }

    getScopes(): Record<string, string> | undefined {
        return this.scopes
    }

    getSecuritySchemeName(): string {
        return this.securitySchemeName;
    }

    getDescription(): string | undefined {
        return this.description;
    }

    build(t: KaapiTools) {
        t
            .route({
                path: this.authorizationRoute.path,
                method: ['GET', 'POST'],
                handler: async (req, h) => {
                    // validating query
                    if (
                        req.query.client_id && typeof req.query.client_id === 'string' &&
                        req.query.response_type === 'code' &&
                        req.query.redirect_uri && typeof req.query.redirect_uri === 'string'
                    ) {
                        const params: AuthorizationParams = {
                            clientId: req.query.client_id,
                            redirectUri: req.query.redirect_uri,
                            responseType: req.query.response_type
                        }
                        if (req.query.scope && typeof req.query.scope === 'string') {
                            params.scope = req.query.scope
                        }
                        if (req.query.state && typeof req.query.state === 'string') {
                            params.state = req.query.state
                        }
                        if (req.query.code_challenge && typeof req.query.code_challenge === 'string') {
                            params.codeChallenge = req.query.code_challenge
                        }

                        if (req.method.toLowerCase() === 'get') {
                            return this.authorizationRoute.handler(params, req, h)
                        } else {
                            return this.authorizationRoute.postHandler(params, req, h)
                        }
                    } else {
                        let errorDescription = ''
                        if (!(req.query.client_id && typeof req.query.client_id === 'string')) {
                            errorDescription = 'Request was missing the \'client_id\' parameter.'
                        } else if (!(req.query.response_type === 'code')) {
                            errorDescription = `Request does not support the 'response_type' '${req.query.response_type}'.`
                        } else if (!(req.query.redirect_uri && typeof req.query.redirect_uri === 'string')) {
                            errorDescription = 'Request was missing the \'redirect_uri\' parameter.'
                        }
                        
                        return h.response({ error: 'invalid_request', error_description: errorDescription }).code(400)
                    }
                }
            })

        t.scheme(this.securitySchemeName, this.strategyScheme())
        t.strategy(this.securitySchemeName, this.securitySchemeName, this.options)

        const securityScheme = this.scheme()
        t.openapi?.addSecurityScheme(securityScheme)
            .setDefaultSecurity(securityScheme);
        if (securityScheme instanceof OAuth2Util && !securityScheme.getHost() && t.postman?.getHost().length) {
            securityScheme.setHost(t.postman.getHost()[0])
        }
        t.postman?.setDefaultSecurity(securityScheme);
    }

    scheme() {
        const docs = new OAuth2Util(this.securitySchemeName)
            .setGrantType(this.isWithPkce() ? GrantType.authorizationCodeWithPkce : GrantType.authorizationCode)
            .setScopes(this.getScopes() || {})
            .setAuthUrl(this.authorizationRoute.path)
        /*
        .setAccessTokenUrl(this.tokenRoute.path || '');

    
    if (this.refreshTokenRoute.path) {
        docs.setRefreshUrl(this.refreshTokenRoute.path)
    }
        */

        if (this.description) {
            docs.setDescription(this.description)
        }

        return docs
    }

    strategyScheme(): ServerAuthScheme {
        return (_server, options) => {

            return {
                async authenticate(request, h) {

                    const settings: KaapiAuthOptions = Hoek.applyToDefaults({
                        tokenType: 'Bearer'
                    }, options || {});

                    const authorization = request.raw.req.headers.authorization;

                    const authSplit = authorization ? authorization.split(/\s+/) : ['', ''];

                    const tokenType = authSplit[0]
                    let token = authSplit[1]

                    if (tokenType.toLowerCase() !== settings.tokenType?.toLowerCase()) {
                        token = ''
                    }

                    if (settings.validate) {
                        try {
                            const result = await settings.validate?.(request, token, h)

                            if (result && 'isAuth' in result) {
                                return result
                            }

                            if (result) {
                                const { isValid, credentials, artifacts, message, scheme } = result;

                                if (isValid && credentials) {
                                    return h.authenticated({ credentials, artifacts })
                                }

                                if (message) {
                                    return h.unauthenticated(Boom.unauthorized(message, scheme || settings.tokenType || ''), {
                                        credentials: credentials || {},
                                        artifacts
                                    })
                                }
                            }
                        } catch (err) {
                            return Boom.internal(err instanceof Error ? err : `${err}`)
                        }
                    }

                    return h.unauthenticated(Boom.unauthorized(), { credentials: {} })
                },
            }
        }
    }

}

new MyAuthDesign(
    new AuthRouteClass(),
    {
        
    }
)


/*
const _vv = new MyAuthDesign({
    path: '/oauth2/login',
    handler: async ({ clientId, redirectUri, codeChallenge, scope, state }, { query: { nonce } }, h) => {

        console.log('client_id', clientId)
        console.log('codeChallenge', codeChallenge)
        console.log('redirectUri', redirectUri)
        console.log('scope', scope)
        console.log('state', state)
        console.log('nonce', nonce)

        if (clientId) {
            //#region @TODO: validation

            //#endregion @TODO: validation
        } else {
            return h.response({ error: 'Bad \'client_id\' parameter.' }).code(400)
        }

        // render form
        return h.response(
            buildSignInHTML({
                title: 'Sign in'
            })
        ).code(200).type('text/html')
    },
    async postHandler({ clientId, redirectUri, codeChallenge, scope, state }, { query: { nonce }, payload: { email, password } }, h) {
        console.log('client_id', clientId)
        console.log('codeChallenge', codeChallenge)
        console.log('redirectUri', redirectUri)
        console.log('scope', scope)
        console.log('state', state)
        console.log('nonce', nonce)

        let error = ''

        if (clientId && email && password) {
            //#region @TODO: validation + code
            const code = 'generated_code'
            if (email == 'user@novice1' && password == '1234') {
                return h.redirect(`${redirectUri}?code=${code}${state ? `&state=${state}` : ''}`)
            } else {
                error = 'wrong credentials'
            }
            //#endregion @TODO: validation + code generation
        } else {
            error = 'invalid request'
        }

        // render form
        return h.response(
            buildSignInHTML({
                title: 'Sign in',
                error: error || 'something went wrong'
            })
        ).code(200).type('text/html')
    },
})
*/
