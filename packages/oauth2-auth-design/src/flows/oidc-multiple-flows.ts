import {
    AuthDesign,
    KaapiTools,
    Lifecycle,
    ReqRef,
    ReqRefDefaults,
    RouteOptions,
} from '@kaapi/kaapi'
import {
    DefaultJWKSRoute,
    IJWKSRoute,
    JWKSRoute,
    OAuth2AuthDesignBuilder,
    OAuth2SingleAuthFlow,
    OAuth2SingleAuthFlowBuilder,
    OIDCAuthUtil
} from './common'
import { JWKS, JWKSStore } from '../utils/jwks-store'
import { BaseAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils'
import { JWKSGenerator } from '../utils/jwks-generator'
import { getInMemoryJWKSStore } from '../utils/in-memory-jwks-store'

export type SingleCodeFlow = AuthDesign & OAuth2SingleAuthFlow

//#region OIDCMultipleFlows

export interface OIDCMultipleFlowsArg {
    jwksStore?: JWKSStore
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwksRoute?: DefaultJWKSRoute<any>
    refreshTokenEndpoint?: string
    openidConfiguration?: Record<string, unknown>
    tokenEndpoint: string
    flows: SingleCodeFlow[]
}

export class OIDCMultipleFlows extends AuthDesign {

    protected flows: SingleCodeFlow[];
    protected securitySchemeName = 'OIDC Multiple Flows';
    protected openidConfiguration: Record<string, unknown>;

    protected tokenEndpoint: string;
    protected refreshTokenEndpoint?: string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected jwksRoute?: IJWKSRoute<any>;
    protected jwksStore?: JWKSStore;
    protected jwksGenerator?: JWKSGenerator | undefined;
    protected tokenTTL?: number;

    constructor({
        flows,
        refreshTokenEndpoint,
        tokenEndpoint,
        jwksRoute,
        jwksStore,
        openidConfiguration
    }: OIDCMultipleFlowsArg) {
        super();
        this.flows = [...flows]
        this.refreshTokenEndpoint = refreshTokenEndpoint
        this.tokenEndpoint = tokenEndpoint
        this.jwksRoute = jwksRoute
        this.jwksStore = jwksStore
        this.openidConfiguration = openidConfiguration || {}
    }

    protected getJwksGenerator() {
        if (this.jwksGenerator) return this.jwksGenerator;
        if (this.jwksStore) {
            this.jwksGenerator = new JWKSGenerator(this.jwksStore, this.tokenTTL)
        }
        return this.jwksGenerator
    }

    setTokenTTL(ttlSeconds?: number): this {
        this.tokenTTL = ttlSeconds
        return this
    }

    getTokenTTL(): number | undefined {
        return this.tokenTTL
    }

    /**
     * Name used in the documentation
     */
    setSecuritySchemeName(name: string) {
        if (name)
            this.securitySchemeName = name
    }

    docs(): BaseAuthUtil | undefined {
        return new OIDCAuthUtil(this.securitySchemeName)
    }

    integrateStrategy(t: KaapiTools): void {
        for (const flow of this.flows) {
            flow.integrateStrategy(t)
        }
    }

    integrateHook(t: KaapiTools): void | Promise<void> {

        const jwksGenerator = this.getJwksGenerator();
        const host = t.postman?.getHost()[0] || ''

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const routesOptions: RouteOptions<any> = {
            plugins: {
                kaapi: {
                    docs: false
                }
            }
        }

        const refreshTokenHandlerFlows: SingleCodeFlow[] = []

        for (const flow of this.flows) {
            if (typeof flow.handleRefreshToken === 'function') {
                refreshTokenHandlerFlows.push(flow)
            }
        }

        for (const flow of this.flows) {
            if (typeof flow.registerAuthorizationEndpoint === 'function') {
                flow.registerAuthorizationEndpoint(t)
            }
        }

        // token
        t
            .route<{ Payload: { grant_type?: unknown; } }>({
                options: routesOptions,
                path: this.tokenEndpoint,
                method: 'POST',
                handler: async (req, h) => {
                    const grantType = req.payload.grant_type;

                    if (grantType && typeof grantType === 'string') {
                        if (grantType != 'refresh_token') {
                            for (const flow of this.flows) {
                                if (grantType === flow.grantType) {
                                    return await flow.handleToken(t, req, h)
                                }
                            }
                        } else {
                            if (this.refreshTokenEndpoint === this.tokenEndpoint && refreshTokenHandlerFlows.length) {
                                // iterate to find the right method
                                for (const flow of refreshTokenHandlerFlows) {
                                    if (typeof flow.handleRefreshToken === 'function') {
                                        const result = await flow.handleRefreshToken(t, req, h);
                                        if (result === h.continue) {
                                            continue
                                        } else {
                                            return result
                                        }
                                    }
                                }
                                return h.response({ error: 'invalid_token', error_description: 'Token was not validated by any handler.' }).code(400)
                            }
                        }
                    }

                    return h.response({ error: 'unsupported_grant_type', error_description: `Request does not support the 'grant_type' '${req.payload.grant_type}'.` }).code(400)
                }
            });

        if (this.refreshTokenEndpoint && this.refreshTokenEndpoint != this.tokenEndpoint) {

            if (refreshTokenHandlerFlows.length) {
                t
                    .route<{ Payload: { grant_type?: unknown; } }>({
                        options: routesOptions,
                        path: this.refreshTokenEndpoint,
                        method: 'POST',
                        // iterate to find the right method
                        handler: refreshTokenHandlerFlows.map((f, i, arr) => {
                            return (
                                async (req, h) => {
                                    const result = f.handleRefreshToken ? await f.handleRefreshToken(t, req, h) : h.continue;

                                    if (arr.length - 1 == i && result === h.continue) {
                                        return h
                                            .response({
                                                error: 'invalid_token',
                                                error_description: 'Token was not validated by any handler.'
                                            }).code(400)
                                    }

                                    return result
                                }
                            ) as Lifecycle.Method
                        })
                    });
            }
        }

        // jwks
        if (this.jwksRoute && jwksGenerator) {
            t.route({
                path: this.jwksRoute.path,
                method: 'GET',
                options: {
                    plugins: {
                        kaapi: {
                            docs: false
                        }
                    }
                },
                handler: async (req, h) => {

                    const jwks = await jwksGenerator.generateIfNeeded() as JWKS

                    if (this.jwksRoute?.handler) {
                        return this.jwksRoute.handler({
                            jwks
                        }, req, h)
                    }

                    return jwks
                }
            })
        }

        // discovery endpoint
        t.route({
            path: '/.well-known/openid-configuration',
            method: 'GET',
            options: {
                plugins: {
                    kaapi: {
                        docs: false
                    }
                }
            },
            handler: () => {
                let wellKnownOpenIDConfig: {
                    authorization_endpoint?: string;
                    grant_types_supported: string[];
                    token_endpoint_auth_methods_supported: string[];
                    [key: string]: unknown
                } = {
                    issuer: `${host}`,
                    authorization_endpoint: undefined,
                    token_endpoint: `${host}${this.tokenEndpoint}`,
                    jwks_uri: this.jwksRoute ? `${host}${this.jwksRoute.path}` : undefined,
                    grant_types_supported: [],
                    token_endpoint_auth_methods_supported: []
                }

                for (const flow of this.flows) {
                    if (typeof flow.getDiscoveryConfiguration === 'function') {
                         const {
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            token_endpoint: _unused_token_endpoint,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            jwks_uri: _unused_jwks_uri,
                            ...more
                        } = flow.getDiscoveryConfiguration(t);

                        // merge properties
                        wellKnownOpenIDConfig = {
                            ...wellKnownOpenIDConfig,
                            ...Object.fromEntries(
                                Object.entries(more).map(([key, val]) => [
                                    key,
                                    // merge arrays and ensure unique values (Set)
                                    Array.isArray(wellKnownOpenIDConfig[key]) && Array.isArray(val) ? [...new Set([
                                        ...wellKnownOpenIDConfig[key],
                                        ...val
                                    ])] : val
                                ])
                            )
                        };
                    }
                }

                return { ...wellKnownOpenIDConfig, ...this.openidConfiguration }
            }
        })
    }

    getStrategyName(): string[] {
        return this.flows.map(f => f.getStrategyName()).flat()
    }
}

//#endregion OIDCMultipleFlows

//#region Builder

export type OIDCMultipleFlowsBuilderArg = Omit<OIDCMultipleFlowsArg, 'flows'>


export class OIDCMultipleFlowsBuilder implements OAuth2AuthDesignBuilder {

    protected params: OIDCMultipleFlowsBuilderArg
    protected tokenTTL?: number

    protected builders: OAuth2SingleAuthFlowBuilder[] = []

    constructor(params: OIDCMultipleFlowsBuilderArg) {
        this.params = params
    }

    static create(params?: Partial<OIDCMultipleFlowsBuilderArg>) {
        const paramsComplete: OIDCMultipleFlowsBuilderArg = {
            tokenEndpoint: params && params.tokenEndpoint || '/oauth2/token',
            ...(params || {})
        };
        return new OIDCMultipleFlowsBuilder(paramsComplete)
    }

    additionalConfiguration(openidConfiguration: Record<string, unknown>): this {
        this.params.openidConfiguration = openidConfiguration
        return this
    }

    /**
     * Max TTL for a token all flows included
     */
    setTokenTTL(ttlSeconds?: number): this {
        this.tokenTTL = ttlSeconds
        return this
    }

    setJwksStore(store: JWKSStore): this {
        this.params.jwksStore = store
        return this
    }

    jwksRoute<Refs extends ReqRef = ReqRefDefaults>(handler: (route: DefaultJWKSRoute<Refs>) => void): this {
        this.params.jwksRoute = this.params.jwksRoute || JWKSRoute.buildDefault();
        handler(this.params.jwksRoute)
        return this
    }

    tokenEndpoint(path: string): this {
        if (path)
            this.params.tokenEndpoint = path
        return this
    }

    refreshTokenEndpoint(path: string): this {
        this.params.refreshTokenEndpoint = path
        return this
    }

    add(builder: OAuth2SingleAuthFlowBuilder): this {
        this.builders.push(builder)
        return this;
    }

    build(): OIDCMultipleFlows {
        const result = new OIDCMultipleFlows({
            ...this.params,
            flows: this.builders.map(b => {
                b.setJwksStore(this.params.jwksStore || getInMemoryJWKSStore())
                return b.build()
            })
        });

        result.setTokenTTL(this.tokenTTL)

        return result
    }
}

//#endregion Builder