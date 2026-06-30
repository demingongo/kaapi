import type {
    AuthSchemeHandler,
    FailedAuthorizationAction,
    KaapiAdapted,
    KaapiMethods,
    KaapiOAuth2StrategyOptions,
    KaapiOIDCAdapted,
    KaapiOIDCFlowBuilder,
    KaapiOIDCMethods,
    WebStandardRequestOptions
} from './types.ts';
import { createWebStandardRequest, createTokenEndpointHandler, createSchemeAndStrategy } from './utils.js';
import {
    type ReqRef,
    type ReqRefDefaults,
    type Request as KaapiRequest,
    type KaapiTools,
    RouteOptions,
    Lifecycle,
} from '@kaapi/kaapi';
import { GrantType, OAuth2Util } from '@novice1/api-doc-generator';
import {
    ClientCredentialsFlow,
    ClientCredentialsFlowBuilder,
    type ClientCredentialsFlowOptions,
    evaluateStrategy,
    type OAuth2FlowTokenResponse,
    OIDCClientCredentialsFlow,
    OIDCClientCredentialsFlowBuilder,
    OIDCClientCredentialsFlowOptions,
    StrategyInsufficientScopeError,
    type StrategyResult,
    type StrategyVerifyTokenFunction,
} from '@saurbit/oauth2';
import { OAuth2AuthDesign } from './common.js';

//#region Types and Interfaces

/**
 * Configuration options for {@link KaapiClientCredentialsFlow}.
 *
 * Extends the base `ClientCredentialsFlowOptions` with Kaapi-specific strategy options
 * for token verification and failed-authorization handling.
 *
 * @template Refs - Kaapi request reference types for the application.
 */
export interface KaapiClientCredentialsFlowOptions<Refs extends ReqRef = ReqRefDefaults> extends Omit<
    ClientCredentialsFlowOptions,
    'strategyOptions'
> {
    /** Kaapi-specific strategy options, including token verification and failed authorization handling. */
    strategyOptions: KaapiOAuth2StrategyOptions<Refs>;
}

//#endregion

//#region OIDC Types and Interfaces

/**
 * Configuration options for {@link KaapiOIDCClientCredentialsFlow}.
 *
 * Extends the base `OIDCClientCredentialsFlowOptions` with Kaapi-specific strategy options
 * for token verification and failed-authorization handling.
 *
 * @template Refs - Kaapi request reference types for the application.
 */
export interface KaapiOIDCClientCredentialsFlowOptions<Refs extends ReqRef = ReqRefDefaults> extends Omit<
    OIDCClientCredentialsFlowOptions,
    'strategyOptions'
> {
    /** Kaapi-specific strategy options, including token verification and failed authorization handling. */
    strategyOptions: KaapiOAuth2StrategyOptions<Refs>;

    /**
     * Optional lifecycle method called when the discovery endpoint is requested. 
     * If not provided, a route handler has to be registered to handle the discovery requests, and the flow won't be able to provide a default discovery response.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDiscoveryRequest?: Lifecycle.Method<any, any> | undefined;

    /**
     * Optional lifecycle method called when the JWKS endpoint is requested.
     * If not provided, a route handler has to be registered to handle the JWKS requests, and the flow won't be able to provide a default JWKS response.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onJwksRequest?: Lifecycle.Method<any, any> | undefined;
}

//#endregion

//#region Classes

/**
 * Kaapi adapter for the OAuth 2.0 Client Credentials flow.
 *
 * Wraps {@link ClientCredentialsFlow} to integrate natively with Kaapi's {@link KaapiRequest},
 * providing a token endpoint handler and an auth scheme handler for protecting routes.
 * This flow is intended for machine-to-machine authentication where no user
 * interaction is required.
 *
 * Use {@link KaapiClientCredentialsFlowBuilder} for a fluent configuration API.
 *
 * @template Refs - Kaapi request reference types for the application.
 */
export class KaapiClientCredentialsFlow<Refs extends ReqRef = ReqRefDefaults>
    extends ClientCredentialsFlow
    implements KaapiAdapted<Refs> {
    readonly #tokenVerifier: (request: KaapiRequest<Refs>) => Promise<StrategyResult>;
    readonly #authorizeMiddleware: AuthSchemeHandler<Refs>;

    readonly #failedAuthorizationAction: FailedAuthorizationAction<Refs>;

    readonly #kaapi: KaapiMethods<Refs> = {
        authorizeMiddleware: (scopes?: string[]): AuthSchemeHandler<Refs> => {
            return scopes?.length ? this.#createAuthorizeMiddleware(scopes) : this.#authorizeMiddleware;
        },
        token: async (request: KaapiRequest<Refs>): Promise<OAuth2FlowTokenResponse> => {
            return await this.token(createWebStandardRequest(request));
        },

        verifyToken: async (request: KaapiRequest<Refs>): Promise<StrategyResult> => {
            return await this.#tokenVerifier(request);
        },

        toAuthDesign: (): OAuth2AuthDesign => {
            const schemeName = this.getSecuritySchemeName();
            const scopes = this.getScopes();
            const description = this.getDescription();
            const tokenEndpoint = this.getTokenEndpoint();
            const tokenType = this.tokenType;
            const tokenHandler = this.token.bind(this);
            const tokenVerifierHandler = this.#kaapi.verifyToken.bind(this);

            return new OAuth2AuthDesign({
                docs(): OAuth2Util {
                    const docs = new OAuth2Util(schemeName)
                        .setGrantType(GrantType.clientCredentials)
                        .setScopes(scopes || {})
                        .setAccessTokenUrl(tokenEndpoint);
                    if (description) {
                        docs.setDescription(description);
                    }
                    return docs;
                },

                integrateStrategy(t: KaapiTools): void {
                    createSchemeAndStrategy(
                        t,
                        schemeName,
                        tokenType,
                        tokenVerifierHandler,
                    );
                },

                integrateHook(t: KaapiTools): void {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const routesOptions: RouteOptions<any> = {
                        plugins: {
                            kaapi: {
                                docs: false,
                            },
                        },
                    };

                    // token
                    t.route({
                        options: routesOptions,
                        path: tokenEndpoint,
                        method: 'POST',
                        handler: createTokenEndpointHandler(t, tokenHandler),
                    });
                },

                getStrategyName(): string {
                    return schemeName;
                },
            });
        },
    };

    /**
     * @param options - Full configuration for the Client Credentials flow, including Kaapi-specific strategy options.
     */
    constructor(options: KaapiClientCredentialsFlowOptions<Refs>) {
        const { strategyOptions, ...flowOptions } = options;

        super({
            ...flowOptions,
            strategyOptions: {},
        });

        this.#failedAuthorizationAction =
            strategyOptions.failedAuthorizationAction ??
            (async () => {
                const Boom = await import('@hapi/boom');
                return Boom.unauthorized(null, this.tokenType);
            });

        this.#tokenVerifier = async (request: KaapiRequest<Refs>) => {
            const kaapiVerifyToken = strategyOptions.verifyToken;
            const verifyToken: StrategyVerifyTokenFunction | undefined = kaapiVerifyToken
                ? async (_, params) => {
                    return await kaapiVerifyToken(request, params);
                }
                : undefined;

            return await evaluateStrategy(createWebStandardRequest(request), {
                ...strategyOptions,
                verifyToken,
                tokenType: this._tokenType,
            });
        };

        this.#authorizeMiddleware = this.#createAuthorizeMiddleware([]);
    }

    /**
     * Builds an {@link AuthSchemeHandler} that verifies the bearer token and,
     * optionally, enforces the required scopes.
     *
     * @param scopes - Scopes the token must include. Pass an empty array to skip scope enforcement.
     * @returns A Hapi auth scheme handler.
     */
    #createAuthorizeMiddleware(scopes: string[]): AuthSchemeHandler<Refs> {
        return async (request, h) => {
            const result = await this.kaapi().verifyToken(request);

            if (result.success) {
                if (scopes.length && !scopes.every((n) => result.credentials?.scope?.includes(n))) {
                    return this.#failedAuthorizationAction(
                        request,
                        h,
                        new StrategyInsufficientScopeError('Insufficient scope')
                    );
                }
                return h.authenticated({ credentials: result.credentials });
            }
            return this.#failedAuthorizationAction(request, h, result.error);
        };
    }

    /**
     * Returns a frozen object of Kaapi-adapted methods for use inside Kaapi route handlers.
     *
     * @returns A readonly {@link KaapiMethods} instance.
     */
    kaapi(): Readonly<KaapiMethods<Refs>> {
        return Object.freeze(this.#kaapi);
    }
}

//#endregion

//#region Builders

/**
 * Fluent builder for {@link KaapiClientCredentialsFlow}.
 *
 * Provides a chainable API to configure all aspects of the Client Credentials flow
 * for Kaapi, including client lookup, token generation, token verification, and
 * scope enforcement.
 *
 * @template Refs - Kaapi request reference types for the application.
 *
 * @example
 * ```ts
 * const flow = KaapiClientCredentialsFlowBuilder
 *   .create()
 *   .setTokenEndpoint("/token")
 *   .clientSecretBasicAuthenticationMethod()
 *   .getClient(async (tokenRequest) => lookupClient(tokenRequest))
 *   .generateAccessToken(async (ctx) => generateJwt(ctx))
 *   .tokenVerifier((request, { token }) => verifyJwt(token))
 *   .build();
 * ```
 */
export class KaapiClientCredentialsFlowBuilder<
    Refs extends ReqRef = ReqRefDefaults,
> extends ClientCredentialsFlowBuilder {
    protected strategyOptions: KaapiOAuth2StrategyOptions<Refs> = {};

    /**
     * @param options - Optional partial builder options.
     */
    constructor(options: Partial<KaapiClientCredentialsFlowOptions<Refs>>) {
        const { strategyOptions, ...flowOptions } = options;
        super({
            ...flowOptions,
            strategyOptions: {},
        });
        this.strategyOptions = strategyOptions || {};
    }

    /**
     * Creates a new `KaapiClientCredentialsFlowBuilder` instance.
     *
     * @param options - Optional initial builder options.
     * @returns A new builder instance.
     */
    static create<Refs extends ReqRef = ReqRefDefaults>(
        options?: Partial<KaapiClientCredentialsFlowOptions<Refs>>
    ): KaapiClientCredentialsFlowBuilder<Refs> {
        return new KaapiClientCredentialsFlowBuilder<Refs>(options || {});
    }

    /**
     * Sets the action to invoke when authorization fails (e.g. missing or invalid token).
     *
     * @param action - A {@link FailedAuthorizationAction} invoked with the request, response toolkit, and the authorization error.
     * @returns `this` for chaining.
     */
    failedAuthorizationAction(action: FailedAuthorizationAction<Refs>): this {
        this.strategyOptions.failedAuthorizationAction = action;
        return this;
    }

    /**
     * This method does not have access to the Kaapi context.
     * Use `tokenVerifier` instead to set a handler that receives the Kaapi context.
     * @deprecated Use `tokenVerifier` instead to set a handler that receives the Kaapi {@link KaapiRequest}.
     * @param handler - Handler that receives a Web Standard {@link Request} and token params.
     * @returns `this` for chaining.
     */
    override verifyToken(handler: StrategyVerifyTokenFunction<Request>): this {
        this.strategyOptions.verifyToken = async (request, params) => {
            return await handler(createWebStandardRequest(request), params);
        };
        return this;
    }

    /**
     * Sets the token verification handler with full access to the Kaapi {@link KaapiRequest}.
     *
     * Prefer this over `verifyToken` when you need access to the full typed
     * Kaapi {@link KaapiRequest} during verification.
     *
     * @param handler - Async function that receives the Kaapi {@link KaapiRequest} and token params, and returns a strategy result.
     * @returns `this` for chaining.
     */
    tokenVerifier(handler: StrategyVerifyTokenFunction<KaapiRequest<Refs>>): this {
        this.strategyOptions.verifyToken = handler;
        return this;
    }

    /**
     * Builds and returns a configured {@link KaapiClientCredentialsFlow} instance.
     *
     * @returns A new `KaapiClientCredentialsFlow`.
     */
    override build(): KaapiClientCredentialsFlow<Refs> {
        const params: KaapiClientCredentialsFlowOptions<Refs> = {
            ...this.buildParams(),
            strategyOptions: this.strategyOptions,
        };
        return new KaapiClientCredentialsFlow<Refs>(params);
    }
}

//#endregion

//#region OIDC Classes

/**
 * Kaapi adapter for the OAuth 2.0 OIDC Client Credentials flow.
 *
 * Wraps {@link OIDCClientCredentialsFlow} to integrate natively with Kaapi's {@link KaapiRequest},
 * providing a token endpoint handler, an auth scheme handler for protecting routes, and
 * OpenID Connect discovery and JWKS endpoint support.
 * This flow is intended for machine-to-machine authentication where no user
 * interaction is required.
 *
 * Use {@link KaapiOIDCClientCredentialsFlowBuilder} for a fluent configuration API.
 *
 * @template Refs - Kaapi request reference types for the application.
 */
export class KaapiOIDCClientCredentialsFlow<Refs extends ReqRef = ReqRefDefaults>
    extends OIDCClientCredentialsFlow
    implements KaapiOIDCAdapted<Refs> {
    readonly #tokenVerifier: (request: KaapiRequest<Refs>) => Promise<StrategyResult>;
    readonly #authorizeMiddleware: AuthSchemeHandler<Refs>;

    readonly #failedAuthorizationAction: FailedAuthorizationAction<Refs>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #onDiscoveryRequest?: Lifecycle.Method<any, any> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #onJwksRequest?: Lifecycle.Method<any, any> | undefined;

    readonly #kaapi: KaapiOIDCMethods<Refs> = {
        authorizeMiddleware: (scopes?: string[]): AuthSchemeHandler<Refs> => {
            return scopes?.length ? this.#createAuthorizeMiddleware(scopes) : this.#authorizeMiddleware;
        },
        token: async (request: KaapiRequest<Refs>): Promise<OAuth2FlowTokenResponse> => {
            return await this.token(createWebStandardRequest(request));
        },

        verifyToken: async (request: KaapiRequest<Refs>): Promise<StrategyResult> => {
            return await this.#tokenVerifier(request);
        },

        getDiscoveryConfiguration: <R extends ReqRef = ReqRefDefaults>(request?: KaapiRequest<R>, options?: WebStandardRequestOptions): Record<string, string | string[] | undefined> => {
            return this.getDiscoveryConfiguration(request ? createWebStandardRequest(request, options) : undefined);
        },

        toAuthDesign: (): OAuth2AuthDesign => {
            const schemeName = this.getSecuritySchemeName();
            const scopes = this.getScopes();
            const description = this.getDescription();
            const tokenEndpoint = this.getTokenEndpoint();
            const tokenType = this.tokenType;
            const tokenHandler = this.token.bind(this);
            const tokenVerifierHandler = this.#kaapi.verifyToken.bind(this);
            const onDiscoveryRequest = this.#onDiscoveryRequest;
            const onJwksRequest = this.#onJwksRequest;
            const discoveryUrl = this.getDiscoveryUrl();
            const jwksEndpoint = this.getJwksEndpoint();

            return new OAuth2AuthDesign({
                docs(): OAuth2Util {
                    const docs = new OAuth2Util(schemeName)
                        .setGrantType(GrantType.clientCredentials)
                        .setScopes(scopes || {})
                        .setAccessTokenUrl(tokenEndpoint);
                    if (description) {
                        docs.setDescription(description);
                    }
                    return docs;
                },

                integrateStrategy(t: KaapiTools): void {
                    createSchemeAndStrategy(
                        t,
                        schemeName,
                        tokenType,
                        tokenVerifierHandler,
                    );
                },

                integrateHook(t: KaapiTools, skipCommonRoutes: boolean = false): void {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const routesOptions: RouteOptions<any> = {
                        plugins: {
                            kaapi: {
                                docs: false,
                            },
                        },
                    };

                    if (!skipCommonRoutes) {
                        // token
                        t.route({
                            options: routesOptions,
                            path: tokenEndpoint,
                            method: 'POST',
                            handler: createTokenEndpointHandler(t, tokenHandler),
                        });

                        // discovery endpoint
                        if (onDiscoveryRequest) {
                            t.route({
                                options: routesOptions,
                                path: discoveryUrl,
                                method: 'GET',
                                handler: async (req, h) => await onDiscoveryRequest(req, h),
                            });
                        }

                        // jwks endpoint
                        if (onJwksRequest) {
                            t.route({
                                options: routesOptions,
                                path: jwksEndpoint,
                                method: 'GET',
                                handler: async (req, h) => await onJwksRequest(req, h),
                            });
                        }
                    }
                },

                getStrategyName(): string {
                    return schemeName;
                },
            });
        },
    };

    /**
     * @param options - Full configuration for the Client Credentials flow, including Kaapi-specific strategy options.
     */
    constructor(options: KaapiOIDCClientCredentialsFlowOptions<Refs>) {
        const { strategyOptions, ...flowOptions } = options;

        super({
            ...flowOptions,
            strategyOptions: {},
        });

        this.#failedAuthorizationAction =
            strategyOptions.failedAuthorizationAction ??
            (async () => {
                const Boom = await import('@hapi/boom');
                return Boom.unauthorized(null, this.tokenType);
            });

        this.#tokenVerifier = async (request: KaapiRequest<Refs>) => {
            const kaapiVerifyToken = strategyOptions.verifyToken;
            const verifyToken: StrategyVerifyTokenFunction | undefined = kaapiVerifyToken
                ? async (_, params) => {
                    return await kaapiVerifyToken(request, params);
                }
                : undefined;

            return await evaluateStrategy(createWebStandardRequest(request), {
                ...strategyOptions,
                verifyToken,
                tokenType: this._tokenType,
            });
        };

        this.#authorizeMiddleware = this.#createAuthorizeMiddleware([]);

        this.#onDiscoveryRequest = options.onDiscoveryRequest;
        this.#onJwksRequest = options.onJwksRequest;
    }

    /**
     * Builds an {@link AuthSchemeHandler} that verifies the bearer token and,
     * optionally, enforces the required scopes.
     *
     * @param scopes - Scopes the token must include. Pass an empty array to skip scope enforcement.
     * @returns A Hapi auth scheme handler.
     */
    #createAuthorizeMiddleware(scopes: string[]): AuthSchemeHandler<Refs> {
        return async (request, h) => {
            const result = await this.kaapi().verifyToken(request);

            if (result.success) {
                if (scopes.length && !scopes.every((n) => result.credentials?.scope?.includes(n))) {
                    return this.#failedAuthorizationAction(
                        request,
                        h,
                        new StrategyInsufficientScopeError('Insufficient scope')
                    );
                }
                return h.authenticated({ credentials: result.credentials });
            }
            return this.#failedAuthorizationAction(request, h, result.error);
        };
    }

    /**
     * Returns a frozen object of Kaapi-adapted methods for use inside Kaapi route handlers.
     *
     * @returns A readonly {@link KaapiOIDCMethods} instance.
     */
    kaapi(): Readonly<KaapiOIDCMethods<Refs>> {
        return Object.freeze(this.#kaapi);
    }
}

//#endregion

//#region OIDC Builders

/**
 * Fluent builder for {@link KaapiOIDCClientCredentialsFlow}.
 *
 * Provides a chainable API to configure all aspects of the Client Credentials flow
 * for Kaapi, including client lookup, token generation, token verification, and
 * scope enforcement.
 *
 * @template Refs - Kaapi request reference types for the application.
 *
 * @example
 * ```ts
 * const flow = KaapiOIDCClientCredentialsFlowBuilder
 *   .create()
 *   .setTokenEndpoint("/token")
 *   .clientSecretBasicAuthenticationMethod()
 *   .getClient(async (tokenRequest) => lookupClient(tokenRequest))
 *   .generateAccessToken(async (ctx) => generateJwt(ctx))
 *   .tokenVerifier((request, { token }) => verifyJwt(token))
 *   .build();
 * ```
 */
export class KaapiOIDCClientCredentialsFlowBuilder<
    Refs extends ReqRef = ReqRefDefaults,
> extends OIDCClientCredentialsFlowBuilder implements KaapiOIDCFlowBuilder {
    protected strategyOptions: KaapiOAuth2StrategyOptions<Refs> = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected discoveryRequestHandler?: Lifecycle.Method<any, any> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected jwksRequestHandler?: Lifecycle.Method<any, any> | undefined;

    /**
     * @param options - Optional partial builder options.
     */
    constructor(options: Partial<KaapiOIDCClientCredentialsFlowOptions<Refs>>) {
        const { strategyOptions, ...flowOptions } = options;
        super({
            ...flowOptions,
            strategyOptions: {},
        });
        this.strategyOptions = strategyOptions || {};
    }

    /**
     * Creates a new `KaapiOIDCClientCredentialsFlowBuilder` instance.
     *
     * @param options - Optional initial builder options.
     * @returns A new builder instance.
     */
    static create<Refs extends ReqRef = ReqRefDefaults>(
        options?: Partial<KaapiOIDCClientCredentialsFlowOptions<Refs>>
    ): KaapiOIDCClientCredentialsFlowBuilder<Refs> {
        return new KaapiOIDCClientCredentialsFlowBuilder<Refs>(options || {});
    }

    /**
     * Sets the action to invoke when authorization fails (e.g. missing or invalid token).
     *
     * @param action - A {@link FailedAuthorizationAction} invoked with the request, response toolkit, and the authorization error.
     * @returns `this` for chaining.
     */
    failedAuthorizationAction(action: FailedAuthorizationAction<Refs>): this {
        this.strategyOptions.failedAuthorizationAction = action;
        return this;
    }

    /**
     * This method does not have access to the Kaapi context.
     * Use `tokenVerifier` instead to set a handler that receives the Kaapi context.
     * @deprecated Use `tokenVerifier` instead to set a handler that receives the Kaapi {@link KaapiRequest}.
     * @param handler - Handler that receives a Web Standard {@link Request} and token params.
     * @returns `this` for chaining.
     */
    override verifyToken(handler: StrategyVerifyTokenFunction<Request>): this {
        this.strategyOptions.verifyToken = async (request, params) => {
            return await handler(createWebStandardRequest(request), params);
        };
        return this;
    }

    /**
     * Sets the token verification handler with full access to the Kaapi {@link KaapiRequest}.
     *
     * Prefer this over `verifyToken` when you need access to the full typed
     * Kaapi {@link KaapiRequest} during verification.
     *
     * @param handler - Async function that receives the Kaapi {@link KaapiRequest} and token params, and returns a strategy result.
     * @returns `this` for chaining.
     */
    tokenVerifier(handler: StrategyVerifyTokenFunction<KaapiRequest<Refs>>): this {
        this.strategyOptions.verifyToken = handler;
        return this;
    }

    /**
     * Sets the handler for the OpenID Connect discovery endpoint, which is invoked on GET requests to the discovery URL.
     * @param handler A lifecycle method that receives the Kaapi request, response toolkit, and allows you to handle the discovery request.
     * @returns `this` for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDiscoveryRequest<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>>
        (handler: Lifecycle.Method<R, V> | undefined): this {
        this.discoveryRequestHandler = handler;
        return this;
    }

    /**
     * Sets the handler for the JWKS endpoint, which is invoked on GET requests to the JWKS endpoint URL.
     * @param handler A lifecycle method that receives the Kaapi request, response toolkit, and allows you to handle the JWKS request.
     * @returns `this` for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onJwksRequest<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>>
        (handler: Lifecycle.Method<R, V> | undefined): this {
        this.jwksRequestHandler = handler;
        return this;
    }

    /**
     * Builds and returns a configured {@link KaapiOIDCClientCredentialsFlow} instance.
     *
     * @returns A new `KaapiOIDCClientCredentialsFlow`.
     */
    override build(): KaapiOIDCClientCredentialsFlow<Refs> {
        const params: KaapiOIDCClientCredentialsFlowOptions<Refs> = {
            ...this.buildParams(),
            onDiscoveryRequest: this.discoveryRequestHandler,
            onJwksRequest: this.jwksRequestHandler,
            strategyOptions: this.strategyOptions,
        };
        return new KaapiOIDCClientCredentialsFlow<Refs>(params);
    }
}

//#endregion