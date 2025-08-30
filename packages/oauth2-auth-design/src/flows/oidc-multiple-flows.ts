import {
    AuthDesign,
    KaapiTools,
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

//#region OIDCMultipleFlows

export interface OIDCMultipleFlowsArg {
    jwksStore?: JWKSStore
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwksRoute?: DefaultJWKSRoute<any>
    refreshTokenEndpoint?: string
    openidConfiguration?: Record<string, unknown>
    tokenEndpoint: string
    flows: (AuthDesign & OAuth2SingleAuthFlow)[]
}

export class OIDCMultipleFlows extends AuthDesign {

    protected flows: (AuthDesign & OAuth2SingleAuthFlow)[];
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
        this.flows = flows
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
                            // @TODO: refresh token
                        }
                    }

                    return h.response({ error: 'unsupported_grant_type', error_description: `Request does not support the 'grant_type' '${req.payload.grant_type}'.` }).code(400)
                }
            });


        // @TODO: refresh token

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
                    grant_types_supported: string[];
                    token_endpoint_auth_methods_supported: string[];
                    [key: string]: unknown
                } = {
                    issuer: `${host}`,
                    token_endpoint: `${host}${this.tokenEndpoint}`,
                    jwks_uri: this.jwksRoute ? `${host}${this.jwksRoute.path}` : undefined,
                    grant_types_supported: [],
                    token_endpoint_auth_methods_supported: []
                }

                for (const flow of this.flows) {
                    if (typeof flow.getDiscoveryConfiguration === 'function') {
                        const {
                            grant_types_supported,
                            token_endpoint_auth_methods_supported,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            token_endpoint: _unused_token_endpoint,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            jwks_uri: _unused_jwks_uri,
                            ...more
                        } = flow.getDiscoveryConfiguration(t);

                        wellKnownOpenIDConfig = {
                            ...wellKnownOpenIDConfig,
                            ...more
                        };

                        if (Array.isArray(grant_types_supported)) {
                            if (Array.isArray(wellKnownOpenIDConfig.grant_types_supported)) {
                                // merge and ensure unique values (Set)
                                wellKnownOpenIDConfig.grant_types_supported = [...new Set([
                                    ...wellKnownOpenIDConfig.grant_types_supported,
                                    ...grant_types_supported
                                ])]
                            }
                        }
                        if (Array.isArray(token_endpoint_auth_methods_supported)) {
                            if (Array.isArray(wellKnownOpenIDConfig.token_endpoint_auth_methods_supported)) {
                                // merge and ensure unique values (Set)
                                wellKnownOpenIDConfig.token_endpoint_auth_methods_supported = [...new Set([
                                    ...wellKnownOpenIDConfig.token_endpoint_auth_methods_supported,
                                    ...token_endpoint_auth_methods_supported
                                ])]
                            }
                        }
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