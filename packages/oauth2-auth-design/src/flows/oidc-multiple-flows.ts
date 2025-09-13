import {
    AuthDesign,
    ILogger,
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
    OAuth2ErrorCode,
    OAuth2JwksOptions,
    OAuth2SingleAuthFlow,
    OAuth2SingleAuthFlowBuilder,
    OIDCAuthUtil
} from './common'
import { BaseAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils'
import { JwksKeyStore, JwksRotationTimestampStore, JwksRotator, JwtAuthority } from '../utils/jwt-authority'
import { InMemoryKeyStore } from '../utils/in-memory-key-store'

export type SingleCodeFlow = AuthDesign & OAuth2SingleAuthFlow

//#region MultipleFlows

export interface MultipleFlowsArg {
    logger?: ILogger;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwksRoute?: DefaultJWKSRoute<any>
    openidConfiguration?: Record<string, unknown>
    jwksOptions: OAuth2JwksOptions;
    tokenEndpoint: string
    flows: SingleCodeFlow[]
}

export class MultipleFlows extends AuthDesign {

    protected logger?: ILogger;

    protected flows: SingleCodeFlow[];
    protected securitySchemeName = 'OIDC Multiple Flows';
    protected openidConfiguration: Record<string, unknown>;

    protected tokenEndpoint: string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected jwksRoute?: IJWKSRoute<any>;
    protected jwksKeyStore?: JwksKeyStore;
    protected jwksPublicKeyTtl?: number;
    protected jwksRotationIntervalMs?: number;
    protected jwksRotationTimestampStore?: JwksRotationTimestampStore;

    protected jwtAuthority?: JwtAuthority;
    protected jwksRotator?: JwksRotator;

    constructor({
        flows,
        tokenEndpoint,
        jwksRoute,
        openidConfiguration,
        logger,
        ...props
    }: MultipleFlowsArg) {
        super();
        this.logger = logger
        this.flows = [...flows]
        this.tokenEndpoint = tokenEndpoint
        this.jwksRoute = jwksRoute
        this.openidConfiguration = openidConfiguration || {}

        this.jwksKeyStore = props?.jwksOptions?.keyStore
        this.jwksPublicKeyTtl = props?.jwksOptions?.ttl
        this.jwksRotationIntervalMs = props?.jwksOptions?.rotation?.intervalMs
        this.jwksRotationTimestampStore = props?.jwksOptions?.rotation?.timestampStore
    }

    protected getJwtAuthority(): JwtAuthority | undefined {
        if (this.jwtAuthority) return this.jwtAuthority;
        if (this.jwksRoute || this.jwksKeyStore /*|| this.options.useAccessTokenJwks*/) {
            this.jwtAuthority = new JwtAuthority(this.jwksKeyStore || new InMemoryKeyStore(), this.jwksPublicKeyTtl)
        }
        return this.jwtAuthority
    }

    protected getJwksRotator(): JwksRotator | undefined {
        if (this.jwksRotator) return this.jwksRotator;
        const jwtAuthority = this.getJwtAuthority();
        if (jwtAuthority && this.jwksRotationIntervalMs) {
            this.jwksRotator = new JwksRotator({
                keyGenerator: jwtAuthority,
                rotationIntervalMs: this.jwksRotationIntervalMs,
                rotatorKeyStore: this.jwksRotationTimestampStore || new InMemoryKeyStore(),
                logger: this.logger
            })
        }
        return this.jwksRotator
    }

    async checkAndRotateKeys(): Promise<void> {
        return this.getJwksRotator()?.checkAndRotateKeys()
    }

    async generateKeyPair(): Promise<void> {
        return this.getJwtAuthority()?.generateKeyPair()
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

        const jwtAuthority = this.getJwtAuthority();
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
                            if (refreshTokenHandlerFlows.length) {
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
                                return h.response({ error: OAuth2ErrorCode.INVALID_GRANT, error_description: 'Token was not validated by any handler.' }).code(400)
                            }
                        }
                    }

                    return h.response({ error: OAuth2ErrorCode.UNSUPPORTED_GRANT_TYPE, error_description: `Request does not support the 'grant_type' '${req.payload.grant_type}'.` }).code(400)
                }
            });

        // jwks
        if (this.jwksRoute && jwtAuthority) {
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

                    const jwks = await jwtAuthority.getJwksEndpointResponse()

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
                    device_authorization_endpoint: undefined,
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

//#endregion MultipleFlows

//#region Builder

export type MultipleFlowsBuilderArg = Omit<MultipleFlowsArg, 'flows'>


export class MultipleFlowsBuilder implements OAuth2AuthDesignBuilder {

    protected params: MultipleFlowsBuilderArg

    protected builders: OAuth2SingleAuthFlowBuilder[] = []

    constructor(params: MultipleFlowsBuilderArg) {
        this.params = params
    }

    static create(params?: Partial<MultipleFlowsBuilderArg>) {
        const paramsComplete: MultipleFlowsBuilderArg = {
            tokenEndpoint: params && params.tokenEndpoint || '/oauth2/token',
            jwksOptions: {},
            ...(params || {})
        };
        paramsComplete.jwksOptions = paramsComplete.jwksOptions || {}
        if (!paramsComplete.jwksOptions.keyStore) {
            paramsComplete.jwksOptions.keyStore = new InMemoryKeyStore()
        }
        return new MultipleFlowsBuilder(paramsComplete)
    }

    additionalConfiguration(openidConfiguration: Record<string, unknown>): this {
        this.params.openidConfiguration = openidConfiguration
        return this
    }

    setJwksKeyStore(keyStore: JwksKeyStore): this {
        this.params.jwksOptions = this.params.jwksOptions || {}
        this.params.jwksOptions.keyStore = keyStore
        return this
    }

    /**
     * Should be greater than token TTL for all flows included
     * @param ttl seconds
     */
    setPublicKeyExpiry(ttl: number): this {
        this.params.jwksOptions = this.params.jwksOptions || {}
        this.params.jwksOptions.ttl = ttl
        return this
    }

    setJwksRotatorOptions(jwksRotatorOptions: OAuth2JwksOptions['rotation']): this {
        this.params.jwksOptions = this.params.jwksOptions || {}
        this.params.jwksOptions.rotation = jwksRotatorOptions
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

    add(builder: OAuth2SingleAuthFlowBuilder): this {
        this.builders.push(builder)
        return this;
    }

    build(): MultipleFlows {
        const result = new MultipleFlows({
            ...this.params,
            flows: this.builders.map(b => {
                b.setJwksKeyStore(this.params.jwksOptions.keyStore!);
                if (this.params.jwksOptions.ttl)
                    b.setPublicKeyExpiry(this.params.jwksOptions.ttl)
                return b.build()
            })
        });

        return result
    }
}

//#endregion Builder