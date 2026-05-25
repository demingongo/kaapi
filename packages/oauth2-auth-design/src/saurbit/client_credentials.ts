import type { ReqRef, ReqRefDefaults, Request as KaapiRequest } from "@kaapi/kaapi";
import {
  ClientCredentialsFlow,
  ClientCredentialsFlowBuilder,
  type ClientCredentialsFlowOptions,
  evaluateStrategy,
  type OAuth2FlowTokenResponse,
  StrategyInsufficientScopeError,
  type StrategyResult,
  type StrategyVerifyTokenFunction,
} from "@saurbit/oauth2";
import type {
  AuthSchemeHandler,
  FailedAuthorizationAction,
  KaapiAdapted,
  KaapiMethods,
  OAuth2StrategyOptions
} from "./types.ts";
import { createWebStandardRequest } from "./utils.js";

//#region Types and Interfaces

/**
 * Configuration options for {@link KaapiClientCredentialsFlow}.
 *
 * Extends the base `ClientCredentialsFlowOptions` with Kaapi-specific strategy options
 * for token verification and failed-authorization handling.
 *
 * @template Refs - Kaapi request reference types for the application.
 */
export interface KaapiClientCredentialsFlowOptions<Refs extends ReqRef = ReqRefDefaults>
  extends Omit<ClientCredentialsFlowOptions, "strategyOptions"> {
  /** Kaapi-specific strategy options, including token verification and failed authorization handling. */
  strategyOptions: OAuth2StrategyOptions<Refs>;
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
export class KaapiClientCredentialsFlow<
  Refs extends ReqRef = ReqRefDefaults,
> extends ClientCredentialsFlow implements KaapiAdapted<Refs> {
  readonly #tokenVerifier: (
    request: KaapiRequest<Refs>,
  ) => Promise<StrategyResult>;
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

    this.#failedAuthorizationAction = strategyOptions.failedAuthorizationAction ?? (async () => {
      const Boom = await import("@hapi/boom");
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
        if (
          scopes.length &&
          !scopes.every((n) => result.credentials?.scope?.includes(n))
        ) {
          return this.#failedAuthorizationAction(
            request,
            h,
            new StrategyInsufficientScopeError("Insufficient scope"),
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
  protected strategyOptions: OAuth2StrategyOptions<Refs> = {};

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
    options?: Partial<KaapiClientCredentialsFlowOptions<Refs>>,
  ): KaapiClientCredentialsFlowBuilder<Refs> {
    return new KaapiClientCredentialsFlowBuilder<Refs>(options || {});
  }

  /**
   * Sets the action to invoke when authorization fails (e.g. missing or invalid token).
   *
   * @param action - A handler that receives the Kaapi context and the authorization error.
   * @returns `this` for chaining.
   */
  failedAuthorizationAction(action: FailedAuthorizationAction<Refs>): this {
    this.strategyOptions.failedAuthorizationAction = action;
    return this;
  }

  /**
   * This method does not have access to the Kaapi context.
   * Use `tokenVerifier` instead to set a handler that receives the Kaapi context.
   * @deprecated Use `tokenVerifier` instead to set a handler that receives the Kaapi context.
   * @param handler
   * @returns
   */
  override verifyToken(handler: StrategyVerifyTokenFunction<Request>): this {
    this.strategyOptions.verifyToken = async (request, params) => {
      return await handler(createWebStandardRequest(request), params);
    };
    return this;
  }

  /**
   * Sets the token verification handler with full access to the Kaapi `Context`.
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
