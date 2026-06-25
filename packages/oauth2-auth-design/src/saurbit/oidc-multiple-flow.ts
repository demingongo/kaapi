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
import { AuthSchemeHandler, KaapiOIDCAdapted, KaapiOIDCMultipleFlowsMethods, WebStandardRequestOptions } from "./types";
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

  constructor(args: {
    flows: KaapiOIDCFlow<Refs>[];
    discoveryUrl: string;
    jwksEndpoint?: string;
    tokenEndpoint?: string;
    openidConfiguration?: Record<string, string | string[] | undefined>;
    securitySchemeName: string;
    description?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDiscoveryRequest?: Lifecycle.Method<any, any> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onJwksRequest?: Lifecycle.Method<any, any> | undefined;
  }) {
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
