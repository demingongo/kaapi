import type { AuthDesign, KaapiTools, Lifecycle, ReqRef, ReqRefDefaults, Request, ResponseToolkit } from '@kaapi/kaapi';
import type { BaseAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils';
import type {
    OAuth2FlowTokenResponse,
    StrategyError,
    StrategyOptions,
    StrategyResult,
    StrategyVerifyTokenFunction,
} from '@saurbit/oauth2';

/**
 * Delegate options for {@link OAuth2AuthDesign}.
 *
 * Provides callbacks that implement each method of the `AuthDesign` contract
 * for a single OAuth 2.0 flow.
 */
export interface OAuth2AuthDesignOptions {
    /** Returns the OpenAPI/Postman documentation utility for this auth scheme. */
    docs(): BaseAuthUtil;
    /** Registers the Hapi auth scheme and strategy on the server. */
    integrateStrategy(t: KaapiTools): void;
    /** Returns the name of the registered Hapi auth strategy. */
    getStrategyName(): string;
    /** Optional hook to register the token endpoint route on the server. */
    integrateHook?(t: KaapiTools, skipCommonRoutes?: boolean): void | Promise<void>;
}

/**
 * `AuthDesign` contract for a single OAuth 2.0 flow.
 *
 * Extends the base `AuthDesign` with the `getStrategyName` accessor and an optional
 * `integrateHook` for registering token-endpoint routes on the server.
 */
export interface IOAuth2AuthDesign extends AuthDesign {
    /** Returns the name of the registered Hapi auth strategy. */
    getStrategyName(): string;
    /** Optional hook to register the token endpoint route on the server. */
    integrateHook(t: KaapiTools, skipCommonRoutes?: boolean): void | Promise<void>;
}

/**
 * Delegate options for {@link OAuth2MultipleFlowsAuthDesign}.
 *
 * Like {@link OAuth2AuthDesignOptions} but `getStrategyName` returns an array of
 * strategy names — one per registered flow.
 */
export interface OAuth2MultipleFlowsAuthDesignOptions extends Omit<OAuth2AuthDesignOptions, 'getStrategyName'> {
    /** Returns the name of the registered Hapi auth strategies. */
    getStrategyName(): string[];
}

/**
 * `AuthDesign` contract for multiple concurrent OAuth 2.0 flows.
 *
 * Like {@link IOAuth2AuthDesign} but `getStrategyName` returns an array of
 * strategy names — one per registered flow.
 */
export interface IOAuth2MultipleFlowsAuthDesign extends Omit<IOAuth2AuthDesign, 'getStrategyName'> {
    /** Returns the name of the registered Hapi auth strategies. */
    getStrategyName(): string[];
}

/**
 * Hapi lifecycle handler used as an OAuth2 auth scheme entry point.
 *
 * @template Refs - Kaapi request reference types for the application.
 */
export type AuthSchemeHandler<Refs extends ReqRef = ReqRefDefaults> = (
    request: Request<Refs>,
    h: ResponseToolkit<Refs>
) => Lifecycle.ReturnValue<Refs>;

/**
 * Kaapi-adapted variant of `StrategyOptions`.
 *
 * Replaces the base `verifyToken` signature so the handler receives a typed
 * Kaapi {@link Request} instead of a plain request object.
 *
 * @template Refs - Kaapi request reference types for the application.
 */
export interface KaapiStrategyOptions<Refs extends ReqRef = ReqRefDefaults> extends Omit<
    StrategyOptions,
    'verifyToken'
> {
    /** Handler to verify an extracted access token. Receives the typed Kaapi {@link Request}. */
    verifyToken?: StrategyVerifyTokenFunction<Request<Refs>>;
}

/**
 * Callback invoked when token verification or scope enforcement fails.
 *
 * Use this to customise the error response — for example, throwing a
 * `Boom` error, redirecting the user, or logging the failure.
 * If not provided, the default behaviour is to throw an HTTP 401 exception.
 *
 * @template Refs - Kaapi request reference types for the application.
 *
 * @param request - The Kaapi {@link Request} for the current request.
 * @param h - The Hapi {@link ResponseToolkit} for the current request.
 * @param error - The strategy error that caused the authorization failure.
 */
export interface FailedAuthorizationAction<Refs extends ReqRef = ReqRefDefaults> {
    (request: Request<Refs>, h: ResponseToolkit<Refs>, error: StrategyError): Lifecycle.ReturnValue<Refs>;
}

/**
 * Strategy options passed to Kaapi OAuth2 flow builders.
 *
 * Combines token verification and the failed-authorization callback into a
 * single options object consumed by all Kaapi flow classes.
 *
 * @template Refs - Kaapi request reference types for the application.
 */
export interface KaapiOAuth2StrategyOptions<Refs extends ReqRef = ReqRefDefaults> extends Omit<
    KaapiStrategyOptions<Refs>,
    'tokenType'
> {
    /**
     * Action to invoke when token verification or scope enforcement fails.
     * Defaults to throwing an HTTP 401 exception when not provided.
     */
    failedAuthorizationAction?: FailedAuthorizationAction<Refs>;
}

/**
 * Core Kaapi-adapted methods shared by all OAuth2 flow adapters.
 *
 * Obtained via the `.kaapi()` method on any flow class (e.g.
 * `flow.kaapi().authorizeMiddleware(["scope"])`). All methods accept a typed
 * Kaapi {@link Request} rather than a plain request object.
 *
 * @template Refs - Kaapi request reference types for the application.
 */
export interface KaapiMethods<Refs extends ReqRef = ReqRefDefaults> {
    /**
     * Returns a Hapi auth scheme handler that verifies the bearer token on
     * incoming requests and optionally enforces the given scopes.
     *
     * On success, authenticates the request with the verified credentials.
     * On failure, invokes the configured {@link FailedAuthorizationAction}.
     *
     * @param scopes - Optional list of scopes that the token must include.
     */
    authorizeMiddleware(scopes?: string[]): AuthSchemeHandler<Refs>;
    /**
     * Handles a token endpoint request and returns a typed token response.
     *
     * @param request - The Kaapi {@link Request} for the token endpoint request.
     */
    token(request: Request<Refs>): Promise<OAuth2FlowTokenResponse>;
    /**
     * Extracts and verifies the bearer token from the request.
     *
     * @param request - The Kaapi {@link Request} for the current request.
     * @returns A {@link StrategyResult} indicating success or failure.
     */
    verifyToken(request: Request<Refs>): Promise<StrategyResult>;

    toAuthDesign(): IOAuth2AuthDesign;
}

export interface KaapiOIDCMethods<Refs extends ReqRef = ReqRefDefaults> extends KaapiMethods<Refs> {
    /**
     * Retrieves the OpenID Connect discovery configuration document.
     * 
     * Builds the standard provider metadata fields from the flow's configuration and merges in any static 
     * overrides set via openIdConfiguration. Relative endpoint URLs are resolved against the request's origin 
     * (or the discovery URL's origin if no request is provided).
     * 
     * @param request - Optional Kaapi request object used to determine the full base URL for relative endpoints.
     * @param options - Optional WebStandardRequestOptions object used to customize the request.
     */
    getDiscoveryConfiguration<R extends ReqRef = ReqRefDefaults>(
        request?: Request<R>,
        options?: WebStandardRequestOptions
    ): Record<string, string | string[] | undefined>;
}

/**
 * Kaapi-adapted methods for aggregated OIDC flows.
 *
 * Extends {@link KaapiOIDCMethods} but overrides `toAuthDesign` to return
 * an {@link IOAuth2MultipleFlowsAuthDesign} that covers all registered flows.
 *
 * @template Refs - Kaapi request reference types for the application.
 */
export interface KaapiOIDCMultipleFlowsMethods<Refs extends ReqRef = ReqRefDefaults> extends Omit<KaapiOIDCMethods<Refs>, 'toAuthDesign'> {
    toAuthDesign(): IOAuth2MultipleFlowsAuthDesign;
}

/**
 * Marker interface implemented by all Kaapi-adapted OAuth2 flow classes.
 *
 * Guarantees that the class exposes a `.kaapi()` accessor returning the
 * Kaapi-specific method surface ({@link KaapiMethods}).
 *
 * @template Refs - Kaapi request reference types for the application.
 */
export interface KaapiAdapted<Refs extends ReqRef = ReqRefDefaults> {
    /**
     * Returns the Kaapi-adapted method surface for this flow.
     *
     * The returned object is frozen; use its methods directly inside Kaapi route handlers.
     */
    kaapi(): KaapiMethods<Refs>;
}

export interface KaapiOIDCAdapted<Refs extends ReqRef = ReqRefDefaults> extends KaapiAdapted<Refs> {
    /**
     * Returns the Kaapi-adapted method surface for this flow.
     *
     * The returned object is frozen; use its methods directly inside Kaapi route handlers.
     */
    kaapi(): KaapiOIDCMethods<Refs>;
}

/**
 * Options for {@link createWebStandardRequest}.
 *
 * Allows overriding the request origin used when constructing the absolute URL
 * for the converted Web Standard `Request`.
 */
export interface WebStandardRequestOptions {
    /** Override the origin used to build the absolute URL. Defaults to the request's own origin. */
    origin?: string;
}

export interface KaapiOIDCFlowBuilder {
    /**
     * @param handler - Handler function for the discovery request lifecycle event.
     * @returns The builder instance for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDiscoveryRequest(handler: Lifecycle.Method<any, any>): this;

    /**
     * @param handler - Handler function for the JWKS request lifecycle event.
     * @returns The builder instance for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onJwksRequest(handler: Lifecycle.Method<any, any>): this;
}