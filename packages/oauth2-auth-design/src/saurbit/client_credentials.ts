import type {
    AuthSchemeHandler,
    FailedAuthorizationAction,
    KaapiAdapted,
    KaapiMethods,
    KaapiOAuth2StrategyOptions,
} from './types.ts';
import { createWebStandardRequest } from './utils.js';
import {
    type ReqRef,
    type ReqRefDefaults,
    type Request as KaapiRequest,
    AuthDesign,
    type KaapiTools,
    RouteOptions,
} from '@kaapi/kaapi';
import { GrantType, OAuth2Util } from '@novice1/api-doc-generator';
import { BaseAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils.js';
import {
    ClientCredentialsFlow,
    ClientCredentialsFlowBuilder,
    type ClientCredentialsFlowOptions,
    evaluateStrategy,
    type OAuth2FlowTokenResponse,
    StrategyInsufficientScopeError,
    type StrategyResult,
    type StrategyVerifyTokenFunction,
    UnauthorizedClientError,
    UnsupportedGrantTypeError,
} from '@saurbit/oauth2';

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

//#region Classes

/**
 * Delegate contract consumed by {@link ClientCredentialsAuthDesign}.
 *
 * Each method maps directly to the corresponding `AuthDesign` contract,
 * allowing the implementation to be constructed from a plain object (e.g.
 * inside `flow.kaapi().toAuthDesign()`).
 */
export interface ClientCredentialsAuthDesignOptions {
    /** Returns the OpenAPI/Postman documentation utility for this auth scheme. */
    docs(): BaseAuthUtil;
    /** Registers the Hapi auth scheme and strategy on the server. */
    integrateStrategy(t: KaapiTools): void;
    /** Returns the name of the registered Hapi auth strategy. */
    getStrategyName(): string;
    /** Optional hook to register the token endpoint route on the server. */
    integrateHook?(t: KaapiTools): void | Promise<void>;
}

/**
 * Concrete {@link AuthDesign} implementation for the OAuth 2.0 Client Credentials flow.
 *
 * Delegates all `AuthDesign` contract methods to the {@link ClientCredentialsAuthDesignOptions}
 * provided at construction time. Obtain an instance via
 * `flow.kaapi().toAuthDesign()` on a {@link KaapiClientCredentialsFlow}.
 */
export class ClientCredentialsAuthDesign extends AuthDesign {
    #options: ClientCredentialsAuthDesignOptions;

    /** @param options - Delegate implementation for each `AuthDesign` method. */
    constructor(options: ClientCredentialsAuthDesignOptions) {
        super();
        this.#options = options;
    }
    /** @inheritdoc */
    docs(): BaseAuthUtil {
        return this.#options.docs();
    }
    /** @inheritdoc */
    integrateStrategy(t: KaapiTools): void {
        return this.#options.integrateStrategy(t);
    }
    /** @inheritdoc */
    getStrategyName(): string {
        return this.#options.getStrategyName();
    }

    /** @inheritdoc */
    integrateHook(t: KaapiTools): void | Promise<void> {
        return this.#options.integrateHook ? this.#options.integrateHook(t) : undefined;
    }
}

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

        toAuthDesign: (): ClientCredentialsAuthDesign => {
            const schemeName = this.getSecuritySchemeName();
            const scopes = this.getScopes();
            const description = this.getDescription();
            const tokenEndpoint = this.getTokenEndpoint();
            const tokenType = this.tokenType;
            const tokenHandler = this.token.bind(this);
            const tokenVerifierHandler = this.#kaapi.verifyToken.bind(this);

            return new ClientCredentialsAuthDesign({
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
                    // Register the auth scheme for the multiple flows
                    t.scheme(schemeName, (_server) => {
                        return {
                            async authenticate(request, h) {
                                try {
                                    const result = await tokenVerifierHandler(request as unknown as KaapiRequest<Refs>);
                                    if (result.success) {
                                        return h.authenticated({ credentials: result.credentials });
                                    }
                                    const Boom = await import('@hapi/boom');
                                    return h.unauthenticated(Boom.unauthorized(result.error.message, tokenType), {
                                        credentials: {},
                                    });
                                } catch (err) {
                                    const Boom = await import('@hapi/boom');
                                    return Boom.internal(err instanceof Error ? err : `${err}`);
                                }
                            },
                        };
                    });
                    t.strategy(schemeName, schemeName);
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
                        handler: async (req, h) => {
                            const result = await tokenHandler(createWebStandardRequest(req));
                            if (result.success) {
                                return result.tokenResponse;
                            }
                            const error = result.error;
                            t.log.error({ error }, 'Error');
                            if (
                                error instanceof UnsupportedGrantTypeError ||
                                error instanceof UnauthorizedClientError
                            ) {
                                return h
                                    .response({ error: error.errorCode, errorDescription: error.message })
                                    .code(400);
                            }
                            return h.response({ error: 'invalid_request' }).code(400);
                        },
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
 *   .getClient(async (req) => lookupClient(req))
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
