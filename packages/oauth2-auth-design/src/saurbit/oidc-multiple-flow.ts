import {
  OAuth2Error,
  OAuth2Errors,
  type OAuth2FlowTokenResponse,
  type OIDCFlow,
  OIDCMultipleFlows,
  StrategyError,
  StrategyInternalError,
  StrategyResult,
} from "@saurbit/oauth2";
import { AuthSchemeHandler, KaapiOIDCAdapted, KaapiOIDCFlowBuilder, KaapiOIDCMultipleFlowsMethods, WebStandardRequestOptions } from "./types";
import { KaapiTools, Lifecycle, ReqRef, ReqRefDefaults, Request, RouteOptions } from "@kaapi/kaapi";
import { createTokenEndpointHandler, createWebStandardRequest } from "./utils";
import { OAuth2MultipleFlowsAuthDesign, OIDCAuthUtil } from "./common";

/**
 * A Kaapi-adapted OIDC flow.
 *
 * Combines the base `OIDCFlow` contract with {@link KaapiOIDCAdapted} so that any
 * OIDC flow registered with {@link KaapiOIDCMultipleFlows} exposes a `.kaapi()`
 * accessor for use inside Kaapi route handlers.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 */
export interface KaapiOIDCFlow<
  Refs extends ReqRef = ReqRefDefaults,
> extends OIDCFlow, KaapiOIDCAdapted<Refs> {
}

/**
 * Constructor arguments for {@link KaapiOIDCMultipleFlows}.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 */
export interface KaapiOIDCMultipleFlowsArgs<Refs extends ReqRef = ReqRefDefaults> {
  flows: KaapiOIDCFlow<Refs>[];
  discoveryUrl: string;
  securitySchemeName: string;
  jwksEndpoint?: string;
  tokenEndpoint?: string;
  openidConfiguration?: Record<string, string | string[] | undefined>;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDiscoveryRequest?: Lifecycle.Method<any, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onJwksRequest?: Lifecycle.Method<any, any> | undefined;
}

/**
 * Kaapi adapter that aggregates multiple OIDC flows behind a single interface.
 *
 * Delegates token issuance and token verification to each registered
 * {@link KaapiOIDCFlow} in order, returning the first successful result.
 * The `authorizeMiddleware` similarly tries each flow's middleware in sequence,
 * falling through to the next on a 401 and only propagating the error when all
 * flows have been exhausted.
 *
 * Useful when an authorization server must support more than one grant type
 * or token format simultaneously (e.g. Client Credentials alongside
 * Authorization Code).
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 */
export class KaapiOIDCMultipleFlows<
  Refs extends ReqRef = ReqRefDefaults,
> extends OIDCMultipleFlows<KaapiOIDCFlow<Refs>> {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #onDiscoveryRequest?: Lifecycle.Method<any, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #onJwksRequest?: Lifecycle.Method<any, any> | undefined;

  readonly #kaapi: KaapiOIDCMultipleFlowsMethods<Refs> = {
    authorizeMiddleware: (scopes?: string[]): AuthSchemeHandler<Refs> => {
      const middlewares = this.flows.map((flow) => flow.kaapi().authorizeMiddleware(scopes));
      return async (request, h) => {
        const Boom = await import('@hapi/boom');
        for (const [i, middleware] of middlewares.entries()) {
          try {
            const response = await middleware(request, h);
            if (!Boom.isBoom(response, 401)) {
              return response;
            }
          } catch (error) {
            if (
              middlewares.length - 1 === i ||
              !(Boom.isBoom(error, 401))
            ) {
              throw error;
            }
          }
        }
        return Boom.unauthorized('Unauthorized');
      };
    },
    token: async (request: Request<Refs>): Promise<OAuth2FlowTokenResponse> => {
      const errors: OAuth2Error[] = [];
      for (const flow of this.flows) {
        const result = await flow.kaapi().token(request);
        if (result.success) {
          return result;
        }
        errors.push(result.error);
      }
      return errors.length
        ? { success: false, error: new OAuth2Errors(errors) }
        : { success: false, error: new OAuth2Error("No flows available") };
    },

    verifyToken: async (request: Request<Refs>): Promise<StrategyResult> => {
      const errors: StrategyError[] = [];
      for (const flow of this.flows) {
        const validation = await flow.kaapi().verifyToken(request);
        if (validation.success) {
          return validation;
        }
        errors.push(validation.error);
      }
      return errors.length
        ? { success: false, error: new StrategyInternalError(errors) }
        : { success: false, error: new StrategyInternalError("No flows available") };
    },

    getDiscoveryConfiguration: <R extends ReqRef = ReqRefDefaults>(
      request?: Request<R>,
      options?: WebStandardRequestOptions
    ): Record<string, string | string[] | undefined> => {
      return this.getDiscoveryConfiguration(request ? createWebStandardRequest(request, options) : undefined);
    },

    toAuthDesign: (): OAuth2MultipleFlowsAuthDesign => {
      const schemeName = this.getSecuritySchemeName();
      const description = this.getDescription();
      const tokenEndpoint = this.getTokenEndpoint();
      const tokenHandler = this.token.bind(this);
      const onDiscoveryRequest = this.#onDiscoveryRequest;
      const onJwksRequest = this.#onJwksRequest;

      const discoveryUrl = this.getDiscoveryUrl();
      const jwksEndpoint = this.getJwksEndpoint();

      const authDesigns = this.flows.map((flow) => flow.kaapi().toAuthDesign());

      return new OAuth2MultipleFlowsAuthDesign({
        docs(): OIDCAuthUtil {
          const docs = new OIDCAuthUtil(schemeName)
            .setDiscoveryUrl(discoveryUrl);
          if (description) {
            docs.setDescription(description);
          }
          return docs;
        },

        integrateStrategy(t: KaapiTools): void {
          for (const authDesign of authDesigns) {
            authDesign.integrateStrategy(t);
          }
        },

        integrateHook: async (t: KaapiTools): Promise<void> => {
          for (const authDesign of authDesigns) {
            await authDesign.integrateHook(t, true);
          }

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
        },

        getStrategyName(): string[] {
          return authDesigns.map((authDesign) => authDesign.getStrategyName());
        },
      });
    },
  };

  constructor(args: KaapiOIDCMultipleFlowsArgs<Refs>) {
    super(args);
    this.#onDiscoveryRequest = args.onDiscoveryRequest;
    this.#onJwksRequest = args.onJwksRequest;
  }

  /**
   * Returns a frozen object of Kaapi-adapted methods that fan out across all registered flows.
   *
   * @returns A readonly {@link KaapiOIDCMultipleFlowsMethods} instance.
   */
  kaapi(): Readonly<KaapiOIDCMultipleFlowsMethods<Refs>> {
    return Object.freeze(this.#kaapi);
  }

  getSecuritySchemeNames(): string[] {
    return this.flows.map((flow) => flow.getSecuritySchemeName());
  }
}

/**
 * Builder arguments for {@link KaapiOIDCMultipleFlowsBuilder}.
 *
 * All fields from {@link KaapiOIDCMultipleFlowsArgs} are optional; the `flows` array
 * is omitted because flows are added via {@link KaapiOIDCMultipleFlowsBuilder.addFlow}.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 */
export type KaapiOIDCMultipleFlowsBuilderArgs<Refs extends ReqRef = ReqRefDefaults> = Omit<Partial<KaapiOIDCMultipleFlowsArgs<Refs>>, 'flows'>;

export class KaapiOIDCMultipleFlowsBuilder<Refs extends ReqRef = ReqRefDefaults> implements KaapiOIDCFlowBuilder {
  #flows: KaapiOIDCFlow<Refs>[] = [];
  #discoveryUrl: string = '/.well-known/openid-configuration';
  #securitySchemeName: string = 'OIDC Multiple Flows';
  #jwksEndpoint?: string;
  #tokenEndpoint?: string;
  #openidConfiguration?: Record<string, string | string[] | undefined>;
  #description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #onDiscoveryRequest?: Lifecycle.Method<any, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #onJwksRequest?: Lifecycle.Method<any, any> | undefined;

  static create<Refs extends ReqRef = ReqRefDefaults>(args?: KaapiOIDCMultipleFlowsBuilderArgs<Refs>): KaapiOIDCMultipleFlowsBuilder<Refs> {
    return new KaapiOIDCMultipleFlowsBuilder<Refs>(args);
  }

  /**
   * @param args - Optional initial builder arguments.
   */
  constructor(args?: KaapiOIDCMultipleFlowsBuilderArgs<Refs>) {
    if (args) {
      if (args.discoveryUrl) {
        this.#discoveryUrl = args.discoveryUrl;
      }
      if (args.securitySchemeName) {
        this.#securitySchemeName = args.securitySchemeName;
      }
      if (args.jwksEndpoint) {
        this.#jwksEndpoint = args.jwksEndpoint;
      }
      if (args.tokenEndpoint) {
        this.#tokenEndpoint = args.tokenEndpoint;
      }
      if (args.openidConfiguration) {
        this.#openidConfiguration = args.openidConfiguration;
      }
      if (args.description) {
        this.#description = args.description;
      }
      if (args.onDiscoveryRequest) {
        this.#onDiscoveryRequest = args.onDiscoveryRequest;
      }
      if (args.onJwksRequest) {
        this.#onJwksRequest = args.onJwksRequest;
      }
    }
  }

  /**
   * @param flow - OIDC flow to add to the multiple flows instance. Can be called multiple times to register multiple flows.
   * @returns The builder instance for chaining.
   */
  addFlow(flow: KaapiOIDCFlow<Refs>): this {
    this.#flows.push(flow);
    return this;
  }

  /**
   * @param flows - Array of OIDC flows to add to the multiple flows instance.
   * @returns The builder instance for chaining.
   */
  addFlows(flows: KaapiOIDCFlow<Refs>[]): this {
    this.#flows.push(...flows);
    return this;
  }

  /**
   * @param url - URL of the OpenID Connect discovery document. Defaults to `/.well-known/openid-configuration` if not set.
   * @returns The builder instance for chaining.
   */
  setDiscoveryUrl(url: string): this {
    if (url.trim().length) {
      this.#discoveryUrl = url;
    }
    return this;
  }

  /**
   * @param name - Name of the OpenAPI security scheme entry. Defaults to "OIDC Multiple Flows" if not set.
   * @returns The builder instance for chaining.
   */
  setSecuritySchemeName(name: string): this {
    if (name.trim().length) {
      this.#securitySchemeName = name;
    }
    return this;
  }

  /**
   * @param endpoint - URL of the JWKS endpoint.
   * @returns The builder instance for chaining.
   */
  setJwksEndpoint(endpoint: string): this {
    this.#jwksEndpoint = endpoint;
    return this;
  }

  /**
   * @param endpoint - URL of the token endpoint.
   * @returns The builder instance for chaining.
   */
  setTokenEndpoint(endpoint: string): this {
    this.#tokenEndpoint = endpoint;
    return this;
  }

  /**
   * @param config - Optional overrides merged into the discovery document.
   * @returns The builder instance for chaining.
   */
  setOpenidConfiguration(config: Record<string, string | string[] | undefined>): this {
    this.#openidConfiguration = config;
    return this;
  }

  /**
   * @param description - Human-readable description for the OpenAPI security scheme.
   * @returns The builder instance for chaining.
   */
  setDescription(description: string): this {
    this.#description = description;
    return this;
  }

  /**
   * @param handler - Handler function for the discovery request lifecycle event.
   * @returns The builder instance for chaining.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDiscoveryRequest(handler: Lifecycle.Method<any, any>): this {
    this.#onDiscoveryRequest = handler;
    return this;
  }

  /**
   * @param handler - Handler function for the JWKS request lifecycle event.
   * @returns The builder instance for chaining.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onJwksRequest(handler: Lifecycle.Method<any, any>): this {
    this.#onJwksRequest = handler;
    return this;
  }

  /**
   * Creates a new KaapiOIDCMultipleFlows instance.
   */
  build(): KaapiOIDCMultipleFlows<Refs> {
    return new KaapiOIDCMultipleFlows<Refs>({
      flows: this.#flows,
      discoveryUrl: this.#discoveryUrl,
      securitySchemeName: this.#securitySchemeName,
      jwksEndpoint: this.#jwksEndpoint,
      tokenEndpoint: this.#tokenEndpoint,
      openidConfiguration: this.#openidConfiguration,
      description: this.#description,
      onDiscoveryRequest: this.#onDiscoveryRequest,
      onJwksRequest: this.#onJwksRequest,
    });
  }
}
