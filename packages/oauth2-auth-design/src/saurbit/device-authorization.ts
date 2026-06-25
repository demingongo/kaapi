import {
  AccessDeniedError,
  type DeviceAuthorizationEndpointResponse,
  DeviceAuthorizationFlow,
  DeviceAuthorizationFlowBuilder,
  type DeviceAuthorizationFlowOptions,
  type DeviceAuthorizationProcessResponse,
  evaluateStrategy,
  InvalidRequestError,
  type OAuth2FlowTokenResponse,
  OIDCDeviceAuthorizationFlow,
  OIDCDeviceAuthorizationFlowBuilder,
  OIDCDeviceAuthorizationFlowOptions,
  StrategyInsufficientScopeError,
  type StrategyResult,
  type StrategyVerifyTokenFunction,
} from "@saurbit/oauth2";
import type {
  AuthSchemeHandler,
  FailedAuthorizationAction,
  KaapiAdapted,
  KaapiMethods,
  KaapiOAuth2StrategyOptions,
  KaapiOIDCAdapted,
  KaapiOIDCMethods,
  WebStandardRequestOptions
} from "./types.ts";
import { createWebStandardRequest, createTokenEndpointHandler, createSchemeAndStrategy } from './utils.js';
import {
  type ReqRef,
  type ReqRefDefaults,
  type Request as KaapiRequest,
  type KaapiTools,
  type RouteOptions,
  type RouteExtObject,
  type Lifecycle,
  type MergeRefs,
  type ResponseToolkit,
} from '@kaapi/kaapi';
import { ClientAuthentication, OAuth2Util } from "@novice1/api-doc-generator";
import { OAuth2AuthDesign } from "./common.js";


//#region Types and Interfaces

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface KaapiDeviceAuthorizationLifecycleMethod<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>> {
  (
    this: MergeRefs<R>['Bind'],
    request: KaapiRequest<R>,
    h: ResponseToolkit<R>,
    result: DeviceAuthorizationProcessResponse
  ): V
}

/**
 * Configuration options for {@link KaapiDeviceAuthorizationFlow}.
 *
 * Extends the base `DeviceAuthorizationFlowOptions` with Kaapi-specific strategy options
 * for token verification and failed-authorization handling.
 *
 * @template E - The Kaapi `Env` type for the application.
 */
export interface KaapiDeviceAuthorizationFlowOptions<
  Refs extends ReqRef = ReqRefDefaults,
> extends Omit<DeviceAuthorizationFlowOptions, "strategyOptions"> {
  /** Kaapi-specific strategy options, including token verification and failed authorization handling. */
  strategyOptions: KaapiOAuth2StrategyOptions<Refs>;

  /**
     * Optional lifecycle method called before the authorization endpoint handlers (GET and POST).
     */
  onPreHandler?: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined;

  /**
   * Optional lifecycle method called after processing the authorization endpoint (POST).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onProcessAuthorization?: KaapiDeviceAuthorizationLifecycleMethod<any, any> | undefined;

}

/**
 * Builder options for {@link KaapiDeviceAuthorizationFlowBuilder}.
 *
 * All fields from {@link KaapiDeviceAuthorizationFlowOptions} are optional.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 */
export type KaapiDeviceAuthorizationFlowBuilderOptions<
  Refs extends ReqRef = ReqRefDefaults,
> = Partial<KaapiDeviceAuthorizationFlowOptions<Refs>>;

/**
 * Kaapi-adapted methods for the Device Authorization flow.
 *
 * Extends the base {@link KaapiMethods} with device-specific endpoint helpers that
 * accept a Kaapi `Context` instead of a raw `Request`.
 * Obtained via {@link KaapiDeviceAuthorizationFlow.hono}.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 */
export interface KaapiDeviceAuthorizationMethods<Refs extends ReqRef = ReqRefDefaults, AuthRefs extends ReqRef = ReqRefDefaults> extends KaapiMethods<Refs> {
  /**
     * This method is a convenience method that combines the logic of processing (POST) the device authorization flow for Kaapi.
     * It checks the HTTP method of the request and calls the appropriate method to handle the authorization endpoint logic.
     * @param request - The Kaapi request object containing the authorization form data.
     * @returns The processing response for the device authorization flow.
     */
  processAuthorization(
    request: KaapiRequest<AuthRefs>,
  ): Promise<DeviceAuthorizationProcessResponse>;

  /**
   * This method is a convenience method that handles the authorization endpoint logic for Kaapi.
   * It checks the HTTP method of the request and calls the appropriate method to handle the authorization endpoint logic.
   * @param request - The Kaapi request object containing the authorization form data.
   * @returns The response for the authorization endpoint.
   */
  handleAuthorizationEndpoint<R extends ReqRef = ReqRefDefaults & AuthRefs>(
    request: KaapiRequest<R>,
  ): Promise<DeviceAuthorizationEndpointResponse>;
}

//#endregion

//#region OIDC Types and Interfaces

/**
 * Configuration options for {@link KaapiDeviceAuthorizationFlow}.
 *
 * Extends the base `DeviceAuthorizationFlowOptions` with Kaapi-specific strategy options
 * for token verification and failed-authorization handling.
 *
 * @template E - The Kaapi `Env` type for the application.
 */
export interface KaapiOIDCDeviceAuthorizationFlowOptions<
  Refs extends ReqRef = ReqRefDefaults,
> extends Omit<OIDCDeviceAuthorizationFlowOptions, "strategyOptions"> {
  /** Kaapi-specific strategy options, including token verification and failed authorization handling. */
  strategyOptions: KaapiOAuth2StrategyOptions<Refs>;

  /**
     * Optional lifecycle method called before the authorization endpoint handlers (GET and POST).
     */
  onPreHandler?: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined;

  /**
   * Optional lifecycle method called after processing the authorization endpoint (POST).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onProcessAuthorization?: KaapiDeviceAuthorizationLifecycleMethod<any, any> | undefined;

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

/**
 * Builder options for {@link KaapiDeviceAuthorizationFlowBuilder}.
 *
 * All fields from {@link KaapiDeviceAuthorizationFlowOptions} are optional.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 */
export type KaapiOIDCDeviceAuthorizationFlowBuilderOptions<
  Refs extends ReqRef = ReqRefDefaults,
> = Partial<KaapiOIDCDeviceAuthorizationFlowOptions<Refs>>;

/**
 * Kaapi-adapted methods for the Device Authorization flow.
 *
 * Extends the base {@link KaapiMethods} with device-specific endpoint helpers that
 * accept a Kaapi `Context` instead of a raw `Request`.
 * Obtained via {@link KaapiDeviceAuthorizationFlow.hono}.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 */
export interface KaapiOIDCDeviceAuthorizationMethods<Refs extends ReqRef = ReqRefDefaults, AuthRefs extends ReqRef = ReqRefDefaults>
  extends KaapiDeviceAuthorizationMethods<Refs, AuthRefs>, KaapiOIDCMethods<Refs> {

}

//#endregion

//#region Classes

/**
 * Kaapi adapter for the OAuth 2.0 Device Authorization flow.
 *
 * Wraps {@link DeviceAuthorizationFlow} to integrate natively with Kaapi's `Context`,
 * providing a token endpoint handler, middleware for protecting routes, and
 * convenience methods for the device authorization endpoint.
 * This flow is intended for input-constrained devices (e.g. smart TVs, CLIs)
 * that cannot easily handle a browser-based redirect.
 *
 * Use {@link KaapiDeviceAuthorizationFlowBuilder} for a fluent configuration API.
 *
 * @template E - The Kaapi `Env` type for the application.
 */
export class KaapiDeviceAuthorizationFlow<
  Refs extends ReqRef = ReqRefDefaults,
  AuthRefs extends ReqRef = ReqRefDefaults
> extends DeviceAuthorizationFlow implements KaapiAdapted<Refs> {
  readonly #tokenVerifier: (
    request: KaapiRequest<Refs>,
  ) => Promise<StrategyResult>;
  readonly #authorizeMiddleware: AuthSchemeHandler<Refs>;

  readonly #failedAuthorizationAction: FailedAuthorizationAction<Refs>;

  readonly #onPreHandler?: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #onProcessAuthorization?: KaapiDeviceAuthorizationLifecycleMethod<any, any> | undefined;

  readonly #kaapi: KaapiDeviceAuthorizationMethods<Refs, AuthRefs> = {
    authorizeMiddleware: (scopes?: string[]): AuthSchemeHandler<Refs> => {
      return scopes?.length ? this.#createAuthorizeMiddleware(scopes) : this.#authorizeMiddleware;
    },
    token: async (request: KaapiRequest<Refs>): Promise<OAuth2FlowTokenResponse> => {
      return await this.token(createWebStandardRequest(request));
    },

    verifyToken: async (request: KaapiRequest<Refs>): Promise<StrategyResult> => {
      return await this.#tokenVerifier(request);
    },

    processAuthorization: async (
      request: KaapiRequest<AuthRefs>,
    ): Promise<DeviceAuthorizationProcessResponse> => {
      return await this.processAuthorization(
        createWebStandardRequest(request),
      );
    },

    handleAuthorizationEndpoint: async <R extends ReqRef = ReqRefDefaults>(
      request: KaapiRequest<R>,
    ): Promise<DeviceAuthorizationEndpointResponse> => {
      if (request.method === "post") {
        // In a real implementation, you would authenticate the user here,
        // and if authentication is successful, generate a device code,
        // and return it to the client in the response.

        const result = await this.kaapi().processAuthorization(
          request as unknown as KaapiRequest<AuthRefs>,
        );

        if (result.type === "error") {
          return result;
        }

        return {
          ...result,
          method: "POST",
        };
      }

      return {
        type: "error",
        error: new InvalidRequestError("Unsupported HTTP method"),
      };
    },

    toAuthDesign: () => {
      const schemeName = this.getSecuritySchemeName();
      const scopes = this.getScopes();
      const description = this.getDescription();
      const tokenEndpoint = this.getTokenEndpoint();
      const tokenType = this.tokenType;
      const authEndpoint = this.getAuthorizationEndpoint();
      const tokenHandler = this.token.bind(this);
      const tokenVerifierHandler = this.#kaapi.verifyToken.bind(this);
      const processAuthorization = this.kaapi().processAuthorization.bind(this);
      const onPreHandler = this.#onPreHandler;
      const onProcessAuthorization = this.#onProcessAuthorization;

      const supported = this.getTokenEndpointAuthMethods();

      return new OAuth2AuthDesign({
        docs(): OAuth2Util {
          const docs = new OAuth2Util(schemeName)
            .setGrantType("urn:ietf:params:oauth:grant-type:device_code")
            .setScopes(scopes || {})
            .setAccessTokenUrl(tokenEndpoint);
          if (description) {
            docs.setDescription(description);
          }

          if (
            supported.includes('client_secret_post') ||
            supported.includes('none') ||
            supported.includes('client_secret_jwt') ||
            supported.includes('private_key_jwt')
          ) {
            docs.setClientAuthentication(ClientAuthentication.body);
          } else if (supported.includes('client_secret_basic')) {
            docs.setClientAuthentication(ClientAuthentication.header);
          }

          docs.setAuthUrl(authEndpoint);

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

          t.route({
            options: {
              ...routesOptions,
              ext: {
                onPreHandler: onPreHandler,
              }
            },
            path: authEndpoint,
            method: 'POST',
            handler: async (req, h) => {
              const result = await processAuthorization(req as unknown as KaapiRequest<AuthRefs>);

              // handle post initiation logic (e.g. returning device code, handling errors, etc.) in the onProcessAuthorization lifecycle method
              if (onProcessAuthorization) {
                return await onProcessAuthorization.call(h, req, h, result);
              }

              // default handling if not handled in post handling
              if (result.type === "error") {
                const error = result.error;
                return h.response({
                  error: error instanceof AccessDeniedError ? error.errorCode : "invalid_request",
                  error_description: error instanceof AccessDeniedError ? error.message : "Invalid request",
                  error_uri: error.errorUri,
                }).code(400);
              }

              return h.response(result.deviceCodeResponse).code(200);
            },
          });
        },

        getStrategyName(): string {
          return schemeName;
        },
      });
    }
  };

  constructor(options: KaapiDeviceAuthorizationFlowOptions<Refs>) {
    const { strategyOptions, ...flowOptions } = options;

    super({
      ...flowOptions,
      strategyOptions: {},
    });

    this.#failedAuthorizationAction = strategyOptions.failedAuthorizationAction ?? (async () => {
      const Boom = await import('@hapi/boom');
      return Boom.unauthorized(null, this.tokenType);
    });

    this.#tokenVerifier = async (request: KaapiRequest<Refs>) => {
      const honoVerifyToken = strategyOptions.verifyToken;
      const verifyToken: StrategyVerifyTokenFunction | undefined = honoVerifyToken
        ? async (_, params) => {
          return await honoVerifyToken(request, params);
        }
        : undefined;

      return await evaluateStrategy(createWebStandardRequest(request), {
        ...strategyOptions,
        verifyToken,
        tokenType: this._tokenType,
      });
    };

    this.#authorizeMiddleware = this.#createAuthorizeMiddleware([]);

    this.#onPreHandler = options.onPreHandler;
    this.#onProcessAuthorization = options.onProcessAuthorization;
  }

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
   * @returns A readonly {@link KaapiAuthorizationCodeMethods} instance.
   */
  kaapi(): Readonly<KaapiDeviceAuthorizationMethods<Refs, AuthRefs>> {
    return Object.freeze(this.#kaapi);
  }
}

//#endregion

//#region Builders

/**
 * Fluent builder for {@link KaapiDeviceAuthorizationFlow}.
 *
 * Provides a chainable API to configure all aspects of the Device Authorization flow
 * for Kaapi, including device code generation, token polling, token verification,
 * and scope enforcement.
 *
 * @template E - The Kaapi `Env` type for the application.
 *
 * @example
 * ```ts
 * const flow = KaapiDeviceAuthorizationFlowBuilder
 *   .create()
 *   .setTokenEndpoint("/token")
 *   .tokenVerifier((c, { token }) => verifyJwt(token))
 *   .build();
 * ```
 */
export class KaapiDeviceAuthorizationFlowBuilder<
  Refs extends ReqRef = ReqRefDefaults,
  AuthRefs extends ReqRef = ReqRefDefaults
> extends DeviceAuthorizationFlowBuilder {
  protected strategyOptions: KaapiOAuth2StrategyOptions<Refs> = {};

  constructor(options?: KaapiDeviceAuthorizationFlowBuilderOptions<Refs>) {
    const { strategyOptions, ...flowOptions } = options || {};
    super({
      ...flowOptions,
      strategyOptions: {},
    });
    this.strategyOptions = strategyOptions || {};
  }

  /**
   * Creates a new `KaapiDeviceAuthorizationFlowBuilder` instance.
   *
   * @param options - Optional initial builder options.
   * @returns A new builder instance.
   */
  static create<
    Refs extends ReqRef = ReqRefDefaults,
  >(
    options?: KaapiDeviceAuthorizationFlowBuilderOptions<Refs>,
  ): KaapiDeviceAuthorizationFlowBuilder<Refs> {
    return new KaapiDeviceAuthorizationFlowBuilder<Refs>(options);
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
     * Sets the token verification handler with full access to the Kaapi `Request`.
     *
     * Prefer this over `verifyToken` when you need to access Kaapi
     * request variables, environment bindings, or other request state during verification.
     *
     * @param handler - Async function that receives the Kaapi request and token params, and returns a strategy result.
     * @returns `this` for chaining.
     */
  tokenVerifier(handler: StrategyVerifyTokenFunction<KaapiRequest<Refs>>): this {
    this.strategyOptions.verifyToken = handler;
    return this;
  }

  /**
   * Builds and returns a configured {@link KaapiDeviceAuthorizationFlow} instance.
   *
   * @returns A new `KaapiDeviceAuthorizationFlow`.
   */
  override build(): KaapiDeviceAuthorizationFlow<Refs, AuthRefs> {
    const params: KaapiDeviceAuthorizationFlowOptions<Refs> = {
      ...this.buildParams(),
      strategyOptions: this.strategyOptions,
    };
    return new KaapiDeviceAuthorizationFlow<Refs, AuthRefs>(params);
  }
}

//#endregion

//#region OIDC Classes

/**
 * Kaapi adapter for the OAuth 2.0 Device Authorization flow.
 *
 * Wraps {@link OIDCDeviceAuthorizationFlow} to integrate natively with Kaapi's `Context`,
 * providing a token endpoint handler, middleware for protecting routes, and
 * convenience methods for the device authorization endpoint.
 * This flow is intended for input-constrained devices (e.g. smart TVs, CLIs)
 * that cannot easily handle a browser-based redirect.
 *
 * Use {@link KaapiOIDCDeviceAuthorizationFlowBuilder} for a fluent configuration API.
 *
 * @template E - The Kaapi `Env` type for the application.
 */
export class KaapiOIDCDeviceAuthorizationFlow<
  Refs extends ReqRef = ReqRefDefaults,
  AuthRefs extends ReqRef = ReqRefDefaults
> extends OIDCDeviceAuthorizationFlow implements KaapiOIDCAdapted<Refs> {
  readonly #tokenVerifier: (
    request: KaapiRequest<Refs>,
  ) => Promise<StrategyResult>;
  readonly #authorizeMiddleware: AuthSchemeHandler<Refs>;

  readonly #failedAuthorizationAction: FailedAuthorizationAction<Refs>;

  readonly #onPreHandler?: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #onProcessAuthorization?: KaapiDeviceAuthorizationLifecycleMethod<any, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #onDiscoveryRequest?: Lifecycle.Method<any, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #onJwksRequest?: Lifecycle.Method<any, any> | undefined;

  readonly #kaapi: KaapiOIDCDeviceAuthorizationMethods<Refs, AuthRefs> = {
    authorizeMiddleware: (scopes?: string[]): AuthSchemeHandler<Refs> => {
      return scopes?.length ? this.#createAuthorizeMiddleware(scopes) : this.#authorizeMiddleware;
    },
    token: async (request: KaapiRequest<Refs>): Promise<OAuth2FlowTokenResponse> => {
      return await this.token(createWebStandardRequest(request));
    },

    verifyToken: async (request: KaapiRequest<Refs>): Promise<StrategyResult> => {
      return await this.#tokenVerifier(request);
    },

    processAuthorization: async (
      request: KaapiRequest<AuthRefs>,
    ): Promise<DeviceAuthorizationProcessResponse> => {
      return await this.processAuthorization(
        createWebStandardRequest(request),
      );
    },

    handleAuthorizationEndpoint: async <R extends ReqRef = ReqRefDefaults>(
      request: KaapiRequest<R>,
    ): Promise<DeviceAuthorizationEndpointResponse> => {
      if (request.method === "post") {
        // In a real implementation, you would authenticate the user here,
        // and if authentication is successful, generate a device code,
        // and return it to the client in the response.

        const result = await this.kaapi().processAuthorization(
          request as unknown as KaapiRequest<AuthRefs>,
        );

        if (result.type === "error") {
          return result;
        }

        return {
          ...result,
          method: "POST",
        };
      }

      return {
        type: "error",
        error: new InvalidRequestError("Unsupported HTTP method"),
      };
    },

    getDiscoveryConfiguration: <R extends ReqRef = ReqRefDefaults>(request?: KaapiRequest<R>, options?: WebStandardRequestOptions): Record<string, string | string[] | undefined> => {
      return this.getDiscoveryConfiguration(request ? createWebStandardRequest(request, options) : undefined);
    },

    toAuthDesign: () => {
      const schemeName = this.getSecuritySchemeName();
      const scopes = this.getScopes();
      const description = this.getDescription();
      const tokenEndpoint = this.getTokenEndpoint();
      const tokenType = this.tokenType;
      const authEndpoint = this.getAuthorizationEndpoint();
      const tokenHandler = this.token.bind(this);
      const tokenVerifierHandler = this.#kaapi.verifyToken.bind(this);
      const processAuthorization = this.kaapi().processAuthorization.bind(this);
      const onPreHandler = this.#onPreHandler;
      const onProcessAuthorization = this.#onProcessAuthorization;
      const onDiscoveryRequest = this.#onDiscoveryRequest;
      const onJwksRequest = this.#onJwksRequest;
      const discoveryUrl = this.getDiscoveryUrl();
      const jwksEndpoint = this.getJwksEndpoint();

      const supported = this.getTokenEndpointAuthMethods();

      return new OAuth2AuthDesign({
        docs(): OAuth2Util {
          const docs = new OAuth2Util(schemeName)
            .setGrantType("urn:ietf:params:oauth:grant-type:device_code")
            .setScopes(scopes || {})
            .setAccessTokenUrl(tokenEndpoint);
          if (description) {
            docs.setDescription(description);
          }

          if (
            supported.includes('client_secret_post') ||
            supported.includes('none') ||
            supported.includes('client_secret_jwt') ||
            supported.includes('private_key_jwt')
          ) {
            docs.setClientAuthentication(ClientAuthentication.body);
          } else if (supported.includes('client_secret_basic')) {
            docs.setClientAuthentication(ClientAuthentication.header);
          }

          docs.setAuthUrl(authEndpoint);

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

          t.route({
            options: {
              ...routesOptions,
              ext: {
                onPreHandler: onPreHandler,
              }
            },
            path: authEndpoint,
            method: 'POST',
            handler: async (req, h) => {
              const result = await processAuthorization(req as unknown as KaapiRequest<AuthRefs>);

              // handle post initiation logic (e.g. returning device code, handling errors, etc.) in the onProcessAuthorization lifecycle method
              if (onProcessAuthorization) {
                return await onProcessAuthorization.call(h, req, h, result);
              }

              // default handling if not handled in post handling
              if (result.type === "error") {
                const error = result.error;
                return h.response({
                  error: error instanceof AccessDeniedError ? error.errorCode : "invalid_request",
                  error_description: error instanceof AccessDeniedError ? error.message : "Invalid request",
                  error_uri: error.errorUri,
                }).code(400);
              }

              return h.response(result.deviceCodeResponse).code(200);
            },
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
              handler: async (req, h) => await onJwksRequest.call(h, req, h),
            });
          }
        },

        getStrategyName(): string {
          return schemeName;
        },
      });
    }
  };

  constructor(options: KaapiOIDCDeviceAuthorizationFlowOptions<Refs>) {
    const { strategyOptions, ...flowOptions } = options;

    super({
      ...flowOptions,
      strategyOptions: {},
    });

    this.#failedAuthorizationAction = strategyOptions.failedAuthorizationAction ?? (async () => {
      const Boom = await import('@hapi/boom');
      return Boom.unauthorized(null, this.tokenType);
    });

    this.#tokenVerifier = async (request: KaapiRequest<Refs>) => {
      const honoVerifyToken = strategyOptions.verifyToken;
      const verifyToken: StrategyVerifyTokenFunction | undefined = honoVerifyToken
        ? async (_, params) => {
          return await honoVerifyToken(request, params);
        }
        : undefined;

      return await evaluateStrategy(createWebStandardRequest(request), {
        ...strategyOptions,
        verifyToken,
        tokenType: this._tokenType,
      });
    };

    this.#authorizeMiddleware = this.#createAuthorizeMiddleware([]);

    this.#onPreHandler = options.onPreHandler;
    this.#onProcessAuthorization = options.onProcessAuthorization;
    this.#onDiscoveryRequest = options.onDiscoveryRequest;
    this.#onJwksRequest = options.onJwksRequest;
  }

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
   * @returns A readonly {@link KaapiOIDCDeviceAuthorizationMethods} instance.
   */
  kaapi(): Readonly<KaapiOIDCDeviceAuthorizationMethods<Refs, AuthRefs>> {
    return Object.freeze(this.#kaapi);
  }
}

//#endregion

//#region Builders

/**
 * Fluent builder for {@link KaapiOIDCDeviceAuthorizationFlow}.
 *
 * Provides a chainable API to configure all aspects of the Device Authorization flow
 * for Kaapi, including device code generation, token polling, token verification,
 * and scope enforcement.
 *
 * @template E - The Kaapi `Env` type for the application.
 *
 * @example
 * ```ts
 * const flow = KaapiOIDCDeviceAuthorizationFlowBuilder
 *   .create()
 *   .setTokenEndpoint("/token")
 *   .tokenVerifier((c, { token }) => verifyJwt(token))
 *   .build();
 * ```
 */
export class KaapiOIDCDeviceAuthorizationFlowBuilder<
  Refs extends ReqRef = ReqRefDefaults,
  AuthRefs extends ReqRef = ReqRefDefaults
> extends OIDCDeviceAuthorizationFlowBuilder {
  protected strategyOptions: KaapiOAuth2StrategyOptions<Refs> = {};

  constructor(options?: KaapiOIDCDeviceAuthorizationFlowBuilderOptions<Refs>) {
    const { strategyOptions, ...flowOptions } = options || {};
    super({
      ...flowOptions,
      strategyOptions: {},
    });
    this.strategyOptions = strategyOptions || {};
  }

  /**
   * Creates a new `KaapiOIDCDeviceAuthorizationFlowBuilder` instance.
   *
   * @param options - Optional initial builder options.
   * @returns A new builder instance.
   */
  static create<
    Refs extends ReqRef = ReqRefDefaults,
  >(
    options?: KaapiOIDCDeviceAuthorizationFlowBuilderOptions<Refs>,
  ): KaapiOIDCDeviceAuthorizationFlowBuilder<Refs> {
    return new KaapiOIDCDeviceAuthorizationFlowBuilder<Refs>(options);
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
     * Sets the token verification handler with full access to the Kaapi `Request`.
     *
     * Prefer this over `verifyToken` when you need to access Kaapi
     * request variables, environment bindings, or other request state during verification.
     *
     * @param handler - Async function that receives the Kaapi request and token params, and returns a strategy result.
     * @returns `this` for chaining.
     */
  tokenVerifier(handler: StrategyVerifyTokenFunction<KaapiRequest<Refs>>): this {
    this.strategyOptions.verifyToken = handler;
    return this;
  }

  /**
   * Builds and returns a configured {@link KaapiOIDCDeviceAuthorizationFlow} instance.
   *
   * @returns A new `KaapiOIDCDeviceAuthorizationFlow`.
   */
  override build(): KaapiOIDCDeviceAuthorizationFlow<Refs, AuthRefs> {
    const params: KaapiOIDCDeviceAuthorizationFlowOptions<Refs> = {
      ...this.buildParams(),
      strategyOptions: this.strategyOptions,
    };
    return new KaapiOIDCDeviceAuthorizationFlow<Refs, AuthRefs>(params);
  }
}

//#endregion