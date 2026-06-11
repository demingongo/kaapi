import {
    AccessDeniedError,
    AuthorizationCodeEndpointContext,
    AuthorizationCodeEndpointContinueResponse,
    type AuthorizationCodeEndpointResponse,
    AuthorizationCodeFlow,
    AuthorizationCodeFlowBuilder,
    type AuthorizationCodeFlowOptions,
    type AuthorizationCodeInitiationResponse,
    type AuthorizationCodeProcessResponse,
    type AuthorizationCodeReqData,
    evaluateStrategy,
    InvalidRequestError,
    type OAuth2FlowTokenResponse,
    OIDCAuthorizationCodeEndpointContext,
    type OIDCAuthorizationCodeEndpointResponse,
    OIDCAuthorizationCodeFlow,
    OIDCAuthorizationCodeFlowBuilder,
    type OIDCAuthorizationCodeFlowOptions,
    type OIDCAuthorizationCodeInitiationResponse,
    type OIDCAuthorizationCodeProcessResponse,
    StrategyInsufficientScopeError,
    type StrategyResult,
    type StrategyVerifyTokenFunction,
    UnauthorizedClientError,
    UnsupportedGrantTypeError,
} from "@saurbit/oauth2";
import type {
    AuthSchemeHandler,
    FailedAuthorizationAction,
    KaapiAdapted,
    KaapiMethods,
    KaapiOAuth2StrategyOptions
} from "./types.ts";
import { createWebStandardRequest } from './utils.js';
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
import { ClientAuthentication, GrantType, OAuth2Util } from "@novice1/api-doc-generator";
import { OAuth2AuthDesign, OIDCAuthUtil } from "./common.js";

//#region Types and Interfaces

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface KaapiAuthorizationCodeLifecycleMethod<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>, Result = AuthorizationCodeInitiationResponse | AuthorizationCodeProcessResponse | OIDCAuthorizationCodeInitiationResponse | OIDCAuthorizationCodeProcessResponse> {
    (
        this: MergeRefs<R>['Bind'],
        request: KaapiRequest<R>,
        h: ResponseToolkit<R>,
        result: Result
    ): V
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface LoginFormRenderer<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>, Result = AuthorizationCodeInitiationResponse | AuthorizationCodeProcessResponse | OIDCAuthorizationCodeInitiationResponse | OIDCAuthorizationCodeProcessResponse> {
    (request: KaapiRequest<R>, h: ResponseToolkit<R>, result: Result, ctxt: { statusCode: number, usernameField: string, passwordField: string, errorMessage?: string }): V;
}


export type AuthorizationCodeConsentFormRenderer<
    R extends ReqRef = ReqRefDefaults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>,
    C extends AuthorizationCodeEndpointContext = AuthorizationCodeEndpointContext,
> = LoginFormRenderer<R, V, {
    type: "continue";
    continueResponse: AuthorizationCodeEndpointContinueResponse<C>;
}>;

/**
 * Configuration options for {@link KaapiAuthorizationCodeFlow}.
 *
 * Extends the base `AuthorizationCodeFlowOptions` with Kaapi-specific strategy options
 * and a handler to extract authorization endpoint data from the Kaapi `Request`.
 *
 * @template AuthReqData - The shape of the parsed authorization request data.
 * @template Refs - The Kaapi `ReqRef` type for the application.
 * @template AuthRefs - The Kaapi `ReqRef` type for the authorization request.
 */
export interface KaapiAuthorizationCodeFlowOptions<
    AuthReqData extends AuthorizationCodeReqData = AuthorizationCodeReqData,
    Refs extends ReqRef = ReqRefDefaults,
    AuthRefs extends ReqRef = ReqRefDefaults
> extends Omit<AuthorizationCodeFlowOptions<AuthReqData>, "strategyOptions"> {
    /** Kaapi-specific strategy options, including token verification and failed authorization handling. */
    strategyOptions: KaapiOAuth2StrategyOptions<Refs>;
    /** Handler called on POST requests to parse and return the authorization request data from the Kaapi request. */
    parseAuthorizationEndpointData: (request: KaapiRequest<AuthRefs>) => Promise<AuthReqData>;

    /**
     * Optional lifecycle method called before the authorization endpoint handlers (GET and POST).
     */
    onPreHandler?: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined;
    /**
     * Optional lifecycle method called after initiating the authorization endpoint (GET).
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onInitiateAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, AuthorizationCodeInitiationResponse> | undefined;
    /**
     * Optional lifecycle method called after processing the authorization endpoint (POST).
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onProcessAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, AuthorizationCodeProcessResponse> | undefined;

    /**
     * Optional field name for the username in the default login form. Defaults to "username" if not provided.
     */
    usernameField?: string | undefined;
    /**
     * Optional field name for the password in the default login form. Defaults to "password" if not provided.
     */
    passwordField?: string | undefined;

    /**
     * Optional custom form renderer for the authorization endpoint. If not provided, a default login form will be rendered for GET requests, and a simple success/error response will be returned for POST requests.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loginFormRenderer?: LoginFormRenderer<any, any, AuthorizationCodeInitiationResponse | AuthorizationCodeProcessResponse> | undefined;

    /**
     * Optional custom consent form renderer for the authorization endpoint. If not provided, a default consent form will be rendered when the authorization endpoint returns a "continue" response, prompting the user to allow or deny the requested scopes.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    consentFormRenderer?: AuthorizationCodeConsentFormRenderer<any, any, AuthorizationCodeEndpointContext> | undefined;
}

/**
 * Builder options for {@link KaapiAuthorizationCodeFlowBuilder}.
 *
 * All fields from {@link KaapiAuthorizationCodeFlowOptions} are optional except
 * `parseAuthorizationEndpointData`, which is required.
 *
 * @template AuthReqData - The shape of the parsed authorization request data.
 * @template Refs - The Kaapi `ReqRef` type for the application.
 * @template AuthRefs - The Kaapi `ReqRef` type for the authorization request.
 */
export interface KaapiAuthorizationCodeFlowBuilderOptions<
    AuthReqData extends AuthorizationCodeReqData = AuthorizationCodeReqData,
    Refs extends ReqRef = ReqRefDefaults,
    AuthRefs extends ReqRef = ReqRefDefaults
> extends
    Partial<Omit<KaapiAuthorizationCodeFlowOptions<AuthReqData, Refs, AuthRefs>, "parseAuthorizationEndpointData">>,
    Pick<KaapiAuthorizationCodeFlowOptions<AuthReqData, Refs, AuthRefs>, "parseAuthorizationEndpointData"> {
}

/**
 * Kaapi-adapted methods for the Authorization Code flow.
 *
 * Provides convenience wrappers around the core flow that accept a Kaapi `Request`
 * instead of a raw Web `Request`. Obtained via {@link KaapiAuthorizationCodeFlow.kaapi}.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 * @template AuthRefs - The Kaapi `ReqRef` type for the authorization data.
 */
export interface KaapiAuthorizationCodeMethods<Refs extends ReqRef = ReqRefDefaults, AuthRefs extends ReqRef = ReqRefDefaults> extends KaapiMethods<Refs> {
    /**
     * This method is a convenience method that combines the logic of initiating (GET) the authorization code flow for Kaapi.
     * It checks the HTTP method of the request and calls the appropriate method to handle the authorization endpoint logic.
     * @param request - The Kaapi request object.
     * @returns The initiation response for the authorization code flow.
     */
    initiateAuthorization<R extends ReqRef = ReqRefDefaults>(
        request: KaapiRequest<R>,
    ): Promise<AuthorizationCodeInitiationResponse>;

    /**
     * This method is a convenience method that combines the logic of processing (POST) the authorization code flow for Kaapi.
     * It checks the HTTP method of the request and calls the appropriate method to handle the authorization endpoint logic.
     * @param request - The Kaapi request object containing the authorization form data.
     * @returns The processing response for the authorization code flow.
     */
    processAuthorization(
        request: KaapiRequest<AuthRefs>,
    ): Promise<AuthorizationCodeProcessResponse>;

    /**
     * This method is a convenience method that handles the authorization endpoint logic for Kaapi.
     * It checks the HTTP method of the request and calls the appropriate method to handle the authorization endpoint logic.
     * @param request - The Kaapi request object.
     * @returns The authorization endpoint response, based on the HTTP method.
     */
    handleAuthorizationEndpoint<R extends ReqRef = ReqRefDefaults & AuthRefs>(
        request: KaapiRequest<R>,
    ): Promise<AuthorizationCodeEndpointResponse>;
}

//#endregion

//#region OpenID Connect Types and Interfaces

/**
 * Configuration options for {@link KaapiOIDCAuthorizationCodeFlow}.
 *
 * Extends the base `OIDCAuthorizationCodeFlowOptions` with Kaapi-specific strategy options
 * and a handler to extract authorization endpoint data from the Kaapi `Request`.
 *
 * @template AuthReqData - The shape of the parsed authorization request data.
 * @template Refs - The Kaapi `ReqRef` type for the application.
 * @template AuthRefs - The Kaapi `ReqRef` type for the authorization request.
 */
export interface KaapiOIDCAuthorizationCodeFlowOptions<
    AuthReqData extends AuthorizationCodeReqData = AuthorizationCodeReqData,
    Refs extends ReqRef = ReqRefDefaults,
    AuthRefs extends ReqRef = ReqRefDefaults
> extends Omit<OIDCAuthorizationCodeFlowOptions<AuthReqData>, "strategyOptions"> {
    /** Kaapi-specific strategy options, including token verification and failed authorization handling. */
    strategyOptions: KaapiOAuth2StrategyOptions<Refs>;
    /** Handler called on POST requests to parse and return the authorization request data from the Kaapi request. */
    parseAuthorizationEndpointData: (request: KaapiRequest<AuthRefs>) => Promise<AuthReqData>;

    /**
     * Optional lifecycle method called before the authorization endpoint handlers (GET and POST).
     */
    onPreHandler?: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined;
    /**
     * Optional lifecycle method called after initiating the authorization endpoint (GET).
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onInitiateAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, OIDCAuthorizationCodeInitiationResponse> | undefined;
    /**
     * Optional lifecycle method called after processing the authorization endpoint (POST).
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onProcessAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, OIDCAuthorizationCodeProcessResponse> | undefined;

    /**
     * Optional field name for the username in the default login form. Defaults to "username" if not provided.
     */
    usernameField?: string | undefined;
    /**
     * Optional field name for the password in the default login form. Defaults to "password" if not provided.
     */
    passwordField?: string | undefined;

    /**
     * Optional custom form renderer for the authorization endpoint. If not provided, a default login form will be rendered for GET requests, and a simple success/error response will be returned for POST requests.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loginFormRenderer?: LoginFormRenderer<any, any, OIDCAuthorizationCodeInitiationResponse | OIDCAuthorizationCodeProcessResponse> | undefined;

    /**
     * Optional custom consent form renderer for the authorization endpoint. If not provided, a default consent form will be rendered when the authorization endpoint returns a "continue" response, prompting the user to allow or deny the requested scopes.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    consentFormRenderer?: AuthorizationCodeConsentFormRenderer<any, any, OIDCAuthorizationCodeEndpointContext> | undefined;
}

/**
 * Builder options for {@link KaapiOIDCAuthorizationCodeFlowBuilder}.
 *
 * All fields from {@link KaapiOIDCAuthorizationCodeFlowOptions} are optional except
 * `parseAuthorizationEndpointData`, which is required.
 *
 * @template AuthReqData - The shape of the parsed authorization request data.
 * @template Refs - The Kaapi `ReqRef` type for the application.
 * @template AuthRefs - The Kaapi `ReqRef` type for the authorization request.
 */
export interface KaapiOIDCAuthorizationCodeFlowBuilderOptions<
    AuthReqData extends AuthorizationCodeReqData = AuthorizationCodeReqData,
    Refs extends ReqRef = ReqRefDefaults,
    AuthRefs extends ReqRef = ReqRefDefaults
> extends
    Partial<
        Omit<KaapiOIDCAuthorizationCodeFlowOptions<AuthReqData, Refs, AuthRefs>, "parseAuthorizationEndpointData">
    >,
    Pick<KaapiOIDCAuthorizationCodeFlowOptions<AuthReqData, Refs, AuthRefs>, "parseAuthorizationEndpointData"> {
}

/**
 * Kaapi-adapted methods for the OIDC Authorization Code flow.
 *
 * Provides convenience wrappers around the core OIDC flow that accept a Kaapi `Request`
 * instead of a raw Web `Request`. Obtained via {@link KaapiOIDCAuthorizationCodeFlow.kaapi}.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 * @template AuthRefs - The Kaapi `ReqRef` type for the authorization data.
 */
export interface KaapiOIDCAuthorizationCodeMethods<Refs extends ReqRef = ReqRefDefaults, AuthRefs extends ReqRef = ReqRefDefaults> extends KaapiMethods<Refs> {
    /**
     * This method is a convenience method that combines the logic of initiating (GET) the authorization code flow for Kaapi.
     * It checks the HTTP method of the request and calls the appropriate method to handle the authorization endpoint logic.
     * @param request - The Kaapi request object.
     * @returns The OIDC initiation response for the authorization code flow.
     */
    initiateAuthorization<R extends ReqRef = ReqRefDefaults>(
        request: KaapiRequest<R>,
    ): Promise<OIDCAuthorizationCodeInitiationResponse>;

    /**
     * This method is a convenience method that combines the logic of processing (POST) the authorization code flow for Kaapi.
     * It checks the HTTP method of the request and calls the appropriate method to handle the authorization endpoint logic.
     * @param request - The Kaapi request object containing the authorization form data.
     * @returns The OIDC processing response for the authorization code flow.
     */
    processAuthorization(
        request: KaapiRequest<AuthRefs>,
    ): Promise<OIDCAuthorizationCodeProcessResponse>;

    /**
     * This method is a convenience method that handles the authorization endpoint logic for Kaapi.
     * It checks the HTTP method of the request and calls the appropriate method to handle the authorization endpoint logic.
     * @param request - The Kaapi request object.
     * @returns The OIDC authorization endpoint response, based on the HTTP method.
     */
    handleAuthorizationEndpoint<R extends ReqRef = ReqRefDefaults & AuthRefs>(
        request: KaapiRequest<R>,
    ): Promise<OIDCAuthorizationCodeEndpointResponse>;
}

//#endregion


//#region Constants

const renderDefaultLoginForm: LoginFormRenderer = (_request, h, _result, { statusCode, errorMessage, usernameField, passwordField }) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Sign in</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #111827;
      --accent: #6366f1;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --ring: rgba(99,102,241,.35);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: radial-gradient(1200px 600px at 20% 0%, #1f2937, var(--bg));
      font-family: system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--text);
    }
    .card {
      width: 92%; max-width: 380px; padding: 26px 24px; border-radius: 16px;
      background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: 0 20px 50px rgba(0,0,0,.35);
      backdrop-filter: blur(8px);
    }
    .error {
      background: rgba(239,68,68,.15);
      color: #f87171;
      border: 1px solid rgba(239,68,68,.4);
      padding: 10px 14px;
      border-radius: 10px;
      font-size: .9rem;
      margin-bottom: 14px;
    }
    .title { font-size: 1.25rem; font-weight: 600; letter-spacing: .2px; margin: 0 0 8px; }
    .subtitle { color: var(--muted); font-size: .95rem; margin: 0 0 18px; }
    label { display: block; font-size: .85rem; color: var(--muted); margin: 12px 0 8px; }
    .field {
      display: flex; align-items: center; gap: 8px;
      background: #0b1220; border: 1px solid rgba(255,255,255,.08);
      padding: 12px 14px; border-radius: 12px;
      transition: border-color .2s, box-shadow .2s, transform .05s;
    }
    .field:focus-within {
      border-color: var(--accent); box-shadow: 0 0 0 4px var(--ring);
    }
    .field input {
      all: unset; flex: 1; color: var(--text); caret-color: var(--accent);
    }
    .icon {
      width: 18px; height: 18px; opacity: .7;
      filter: drop-shadow(0 1px 0 rgba(0,0,0,.35));
    }
    .actions { margin-top: 18px; display: flex; align-items: center; justify-content: space-between; }
    .btn {
      appearance: none; border: none; cursor: pointer;
      background: linear-gradient(135deg, #7c3aed, var(--accent));
      color: white; padding: 12px 16px; border-radius: 12px; font-weight: 600;
      box-shadow: 0 10px 20px rgba(99,102,241,.35); transition: transform .05s, filter .2s;
    }
    .btn:hover { filter: brightness(1.05); }
    .btn:active { transform: translateY(1px); }
  </style>
</head>
 <body>
  <form class="card" method="POST">
    <p class="subtitle">Sign in to continue</p>
    ${errorMessage
            ? `<p class="error" id="error-message">
        ${errorMessage}
    </p>`
            : ''
        }

    <label for="${usernameField}">${usernameField}</label>
    <div class="field">
      <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.42 0-8 2.18-8 4.87V21h16v-2.13C20 16.18 16.42 14 12 14Z"/>
      </svg>
      <input id="${usernameField}" name="${usernameField}" type="text" placeholder="${usernameField}" autocomplete="${usernameField}"/>
    </div>

    <label for="${passwordField}">${passwordField}</label>
    <div class="field">
      <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17 8V7a5 5 0 0 0-10 0v1H5v12h14V8Zm-8 0V7a3 3 0 0 1 6 0v1Z"/>
      </svg>
      <input id="${passwordField}" name="${passwordField}" type="password" placeholder="••••••••" autocomplete="current-password"/>
    </div>

    <div class="actions">
      <button class="btn" type="submit">Sign in</button>
    </div>
  </form>
</body>
</html>`;

    return h.response(html).type('text/html').code(statusCode);
};

const renderDefaultConsentForm: AuthorizationCodeConsentFormRenderer = (_request, h, { continueResponse: { scope } }, { statusCode }) => {
    const scopeItems = scope
        .map(s => `      <li class="scope-item">
        <svg class="scope-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span>${s}</span>
      </li>`)
        .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Authorize access</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #111827;
      --accent: #6366f1;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --ring: rgba(99,102,241,.35);
      --danger: #ef4444;
      --danger-ring: rgba(239,68,68,.35);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: radial-gradient(1200px 600px at 20% 0%, #1f2937, var(--bg));
      font-family: system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--text);
    }
    .card {
      width: 92%; max-width: 380px; padding: 26px 24px; border-radius: 16px;
      background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: 0 20px 50px rgba(0,0,0,.35);
      backdrop-filter: blur(8px);
    }
    .title { font-size: 1.25rem; font-weight: 600; letter-spacing: .2px; margin: 0 0 4px; }
    .subtitle { color: var(--muted); font-size: .95rem; margin: 0 0 18px; }
    .scopes-label { font-size: .85rem; color: var(--muted); margin: 0 0 10px; }
    .scopes {
      list-style: none; margin: 0 0 20px; padding: 0;
      background: #0b1220; border: 1px solid rgba(255,255,255,.08);
      border-radius: 12px; overflow: hidden;
    }
    .scope-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; font-size: .9rem;
      border-bottom: 1px solid rgba(255,255,255,.05);
    }
    .scope-item:last-child { border-bottom: none; }
    .scope-icon { width: 16px; height: 16px; color: var(--accent); flex-shrink: 0; }
    .actions { display: flex; gap: 10px; }
    .btn {
      appearance: none; border: none; cursor: pointer;
      flex: 1; padding: 12px 16px; border-radius: 12px; font-weight: 600; font-size: .95rem;
      transition: transform .05s, filter .2s;
    }
    .btn:active { transform: translateY(1px); }
    .btn-allow {
      background: linear-gradient(135deg, #7c3aed, var(--accent));
      color: white;
      box-shadow: 0 10px 20px var(--ring);
    }
    .btn-allow:hover { filter: brightness(1.05); }
    .btn-deny {
      background: rgba(239,68,68,.12);
      color: #f87171;
      border: 1px solid rgba(239,68,68,.3);
    }
    .btn-deny:hover { background: rgba(239,68,68,.2); }
  </style>
</head>
<body>
  <form class="card" method="POST">
    <p class="title">Authorize access</p>
    <p class="subtitle">This application is requesting the following permissions:</p>
    <p class="scopes-label">Requested scopes</p>
    <ul class="scopes">
${scopeItems}
    </ul>
    <div class="actions">
      <button class="btn btn-deny" type="submit" name="consent" value="deny">Deny</button>
      <button class="btn btn-allow" type="submit" name="consent" value="allow">Allow</button>
    </div>
  </form>
</body>
</html>`;


    return h.response(html)
        .type('text/html')
        .code(statusCode)
};

//#endregion

//#region Classes

/**
 * Kaapi adapter for the OAuth 2.0 Authorization Code flow.
 *
 * Wraps {@link AuthorizationCodeFlow} to integrate natively with Kaapi's `Request`,
 * providing middleware for route protection and convenience methods for the
 * authorization and token endpoints.
 *
 * Use {@link KaapiAuthorizationCodeFlowBuilder} for a fluent configuration API.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 * @template AuthReqData - The shape of the parsed authorization request data.
 * @template AuthRefs - The Kaapi `ReqRef` type for the authorization request.
 */
export class KaapiAuthorizationCodeFlow<
    Refs extends ReqRef = ReqRefDefaults,
    AuthReqData extends AuthorizationCodeReqData = AuthorizationCodeReqData,
    AuthRefs extends ReqRef = ReqRefDefaults

> extends AuthorizationCodeFlow<AuthReqData> implements KaapiAdapted<Refs> {
    readonly #tokenVerifier: (
        request: KaapiRequest<Refs>,
    ) => Promise<StrategyResult>;
    readonly #authorizeMiddleware: AuthSchemeHandler<Refs>;

    readonly #failedAuthorizationAction: FailedAuthorizationAction<Refs>;

    readonly #parseAuthorizationEndpointData: (
        request: KaapiRequest<AuthRefs>,
    ) => Promise<AuthReqData>;

    readonly #usernameField?: string | undefined;
    readonly #passwordField?: string | undefined;

    readonly #onPreHandler?: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #onInitiateAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, AuthorizationCodeInitiationResponse> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #onProcessAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, AuthorizationCodeProcessResponse> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #loginFormRenderer?: LoginFormRenderer<any, any, AuthorizationCodeInitiationResponse | AuthorizationCodeProcessResponse> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #consentFormRenderer?: AuthorizationCodeConsentFormRenderer<any, any, AuthorizationCodeEndpointContext> | undefined;

    readonly #kaapi: KaapiAuthorizationCodeMethods<Refs, AuthRefs> = {
        authorizeMiddleware: (scopes?: string[]): AuthSchemeHandler<Refs> => {
            return scopes?.length ? this.#createAuthorizeMiddleware(scopes) : this.#authorizeMiddleware;
        },
        token: async (request: KaapiRequest<Refs>): Promise<OAuth2FlowTokenResponse> => {
            return await this.token(createWebStandardRequest(request));
        },

        verifyToken: async (request: KaapiRequest<Refs>): Promise<StrategyResult> => {
            return await this.#tokenVerifier(request);
        },

        initiateAuthorization: async <R extends ReqRef = ReqRefDefaults>(
            request: KaapiRequest<R>,
        ): Promise<AuthorizationCodeInitiationResponse> => {
            return await this.initiateAuthorization(createWebStandardRequest(request));
        },

        processAuthorization: async (
            request: KaapiRequest<AuthRefs>,
        ): Promise<AuthorizationCodeProcessResponse> => {
            return await this.processAuthorization(
                createWebStandardRequest(request),
                await this.#parseAuthorizationEndpointData(request),
            );
        },

        handleAuthorizationEndpoint: async <R extends ReqRef = ReqRefDefaults>(
            request: KaapiRequest<R>,
        ): Promise<AuthorizationCodeEndpointResponse> => {
            if (request.method === "get") {
                // In a real implementation, you would render a login page
                // or consent page here for the user
                // to authenticate and authorize the client.
                const result = await this.kaapi().initiateAuthorization(request);

                if (!result.success) {
                    return {
                        type: "error",
                        ...result,
                    };
                }

                return {
                    ...result,
                    type: "initiated",
                    method: "GET",
                };
            }

            if (request.method === "post") {
                // In a real implementation, you would authenticate the user here,
                // and if authentication is successful, generate an authorization code,
                // and redirect the user to the redirect_uri with the code and state as query parameters.

                const result = await this.kaapi().processAuthorization(request as unknown as KaapiRequest<AuthRefs>);

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
                redirectable: false,
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
            const initAuthorization = this.kaapi().initiateAuthorization.bind(this);
            const processAuthorization = this.kaapi().processAuthorization.bind(this);
            const onPreHandler = this.#onPreHandler;
            const onInitiateAuthorization = this.#onInitiateAuthorization;
            const onProcessAuthorization = this.#onProcessAuthorization;
            const usernameField = this.getUsernameField();
            const passwordField = this.getPasswordField();
            const renderLoginForm = this.#loginFormRenderer || renderDefaultLoginForm;
            const renderConsentForm = this.#consentFormRenderer || renderDefaultConsentForm;

            const supported = this.getTokenEndpointAuthMethods();

            return new OAuth2AuthDesign({
                docs(): OAuth2Util {
                    const docs = new OAuth2Util(schemeName)
                        .setGrantType(GrantType.authorizationCodeWithPkce)
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

                    // authorization endpoint
                    t.route({
                        options: {
                            ...routesOptions,
                            ext: {
                                onPreHandler: onPreHandler,
                            }
                        },
                        path: authEndpoint,
                        method: 'GET',
                        handler: async (req, h) => {
                            //try {
                            const result = await initAuthorization(req);

                            // handle post initiation logic (e.g. rendering login page, handling errors, etc.) in the onInitiateAuthorization lifecycle method
                            if (onInitiateAuthorization) {
                                return await onInitiateAuthorization.call(h, req, h, result);
                            }

                            // default handling if not handled in post handling
                            if (result.success) {
                                return renderLoginForm(
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    req as any,
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    h as any,
                                    result,
                                    {
                                        statusCode: 200,
                                        usernameField,
                                        passwordField
                                    }
                                );
                            }
                            return h.response({ error: "invalid_request" }).code(400);
                            //} catch (_error) {
                            //    // TODO: error handling or ...
                            //
                            //    // default error handling if not handled in error handling
                            //    return h.response({ error: "server_error" }).code(500);
                            //}
                        },
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
                            //try {
                            const result = await processAuthorization(req as unknown as KaapiRequest<AuthRefs>);

                            // handle post initiation logic (e.g. rendering login page, handling errors, etc.) in the onProcessAuthorization lifecycle method
                            if (onProcessAuthorization) {
                                return await onProcessAuthorization.call(h, req, h, result);
                            }

                            // default handling if not handled in post handling
                            if (result.type === "error") {
                                const error = result.error;
                                if (result.redirectable) {
                                    const qs = [
                                        `error=${encodeURIComponent(error instanceof AccessDeniedError ? error.errorCode : "invalid_request")}`,
                                        `error_description=${encodeURIComponent(
                                            error instanceof AccessDeniedError ? error.message : "Invalid request"
                                        )}`,
                                        result.state ? `state=${encodeURIComponent(result.state)}` : null,
                                    ]
                                        .filter(Boolean)
                                        .join("&");
                                    return h.redirect(`${result.redirectUri}?${qs}`);
                                }
                                return renderLoginForm(
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    req as any,
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    h as any,
                                    result,
                                    {
                                        statusCode: 400,
                                        errorMessage: error.message,
                                        usernameField,
                                        passwordField
                                    }
                                );
                            }

                            if (result.type === "code") {
                                const {
                                    code,
                                    context: { state, redirectUri },
                                } = result.authorizationCodeResponse;
                                const searchParams = new URLSearchParams();
                                searchParams.set("code", code);
                                if (state) searchParams.set("state", state);
                                return h.redirect(`${redirectUri}?${searchParams.toString()}`);
                            }

                            if (result.type === "continue") {
                                return renderConsentForm(
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    req as any,
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    h as any,
                                    result,
                                    {
                                        statusCode: 200,
                                        usernameField,
                                        passwordField
                                    }
                                );
                            }

                            if (result.type === "unauthenticated") {
                                return renderLoginForm(
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    req as any,
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    h as any,
                                    result,
                                    {
                                        statusCode: 400,
                                        errorMessage: result.message || "Authentication failed. Please try again.",
                                        usernameField,
                                        passwordField
                                    }
                                );
                            }
                            //} catch (_error) {
                            //    // TODO: error handling or ...
                            //
                            //    // default error handling if not handled in error handling
                            //    return h.response(
                            //        renderLoginForm({
                            //            errorMessage: "An unexpected error occurred. Please try again later.",
                            //            usernameField,
                            //            passwordField
                            //        }))
                            //        .type('text/html')
                            //        .code(500);
                            //}

                            return renderLoginForm(
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                req as any,
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                h as any,
                                result,
                                {
                                    statusCode: 400,
                                    errorMessage: "Could not process the request. Please try again.",
                                    usernameField,
                                    passwordField
                                }
                            );
                        },
                    });
                },

                getStrategyName(): string {
                    return schemeName;
                },
            });
        }
    };

    constructor(options: KaapiAuthorizationCodeFlowOptions<AuthReqData, Refs, AuthRefs>) {
        const { strategyOptions, ...flowOptions } = options;

        super({
            ...flowOptions,
            strategyOptions: {},
        });

        this.#failedAuthorizationAction = strategyOptions.failedAuthorizationAction ?? (async () => {
            const Boom = await import('@hapi/boom');
            return Boom.unauthorized(null, this.tokenType);
        });

        this.#parseAuthorizationEndpointData = options.parseAuthorizationEndpointData;

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

        this.#onPreHandler = options.onPreHandler;
        this.#onInitiateAuthorization = options.onInitiateAuthorization;
        this.#onProcessAuthorization = options.onProcessAuthorization;

        this.#usernameField = options.usernameField;
        this.#passwordField = options.passwordField;

        this.#loginFormRenderer = options.loginFormRenderer;
        this.#consentFormRenderer = options.consentFormRenderer;
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
    kaapi(): Readonly<KaapiAuthorizationCodeMethods<Refs, AuthRefs>> {
        return Object.freeze(this.#kaapi);
    }

    getUsernameField(): string {
        return this.#usernameField || 'username';
    }

    getPasswordField(): string {
        return this.#passwordField || 'password';
    }
}

//#endregion

//#region Builders

/**
 * Fluent builder for {@link KaapiAuthorizationCodeFlow}.
 *
 * Provides a chainable API to configure all aspects of the Authorization Code flow
 * for Kaapi, including client lookup, token generation, token verification, scope
 * enforcement, and authorization endpoint data parsing.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 * @template AuthReqData - The shape of the parsed authorization request data.
 * @template AuthRefs - The Kaapi `ReqRef` type for the authorization request.
 *
 * @example
 * ```ts
 * const flow = KaapiAuthorizationCodeFlowBuilder
 *   .create({ parseAuthorizationEndpointData: (c) => parseFormData(c) })
 *   .setTokenEndpoint("/token")
 *   .tokenVerifier((c, { token }) => verifyJwt(token))
 *   .build();
 * ```
 */
export class KaapiAuthorizationCodeFlowBuilder<
    Refs extends ReqRef = ReqRefDefaults,
    AuthReqData extends AuthorizationCodeReqData = AuthorizationCodeReqData,
    AuthRefs extends ReqRef = ReqRefDefaults
> extends AuthorizationCodeFlowBuilder<AuthReqData> {
    protected strategyOptions: KaapiOAuth2StrategyOptions<Refs> = {};
    protected parseAuthorizationEndpointDataHandler: (
        request: KaapiRequest<AuthRefs>,
    ) => Promise<AuthReqData>;
    protected onPreHandler?: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected onInitiateAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, AuthorizationCodeInitiationResponse> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected onProcessAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, AuthorizationCodeProcessResponse> | undefined;
    protected usernameField?: string | undefined;
    protected passwordField?: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected loginFormRenderer?: LoginFormRenderer<any, any, AuthorizationCodeInitiationResponse | AuthorizationCodeProcessResponse> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected consentFormRenderer?: AuthorizationCodeConsentFormRenderer<any, any, any> | undefined;

    constructor(options: KaapiAuthorizationCodeFlowBuilderOptions<AuthReqData, Refs, AuthRefs>) {
        const { strategyOptions, parseAuthorizationEndpointData, ...flowOptions } = options;
        super({
            ...flowOptions,
            strategyOptions: {},
        });
        this.strategyOptions = strategyOptions || {};
        this.parseAuthorizationEndpointDataHandler = parseAuthorizationEndpointData;
    }

    /**
     * Creates a new `KaapiAuthorizationCodeFlowBuilder` instance.
     *
     * @param options - Initial builder options. `parseAuthorizationEndpointData` is required.
     * @returns A new builder instance.
     */
    static create<
        Refs extends ReqRef = ReqRefDefaults,
        AuthReqData extends AuthorizationCodeReqData = AuthorizationCodeReqData,
    >(
        options: KaapiAuthorizationCodeFlowBuilderOptions<AuthReqData, Refs>,
    ): KaapiAuthorizationCodeFlowBuilder<Refs, AuthReqData> {
        return new KaapiAuthorizationCodeFlowBuilder<Refs, AuthReqData>(options);
    }

    /**
     * Sets the action to invoke when authorization fails (e.g. missing or invalid token).
     *
     * @param action - A handler that receives the Kaapi request and the authorization error.
     * @returns `this` for chaining.
     */
    failedAuthorizationAction(action: FailedAuthorizationAction<Refs>): this {
        this.strategyOptions.failedAuthorizationAction = action;
        return this;
    }

    /**
     * This method does not have access to the Kaapi request.
     * Use `tokenVerifier` instead to set a handler that receives the Kaapi request.
     * @deprecated Use `tokenVerifier` instead to set a handler that receives the Kaapi request.
     * @param handler - A function that receives a standard Web `Request` and token params.
     * @returns `this` for chaining.
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
     * Sets the handler used to parse authorization request data from the Kaapi request on POST requests.
     *
     * @param handler - Async function that extracts and returns the authorization request data.
     * @returns `this` for chaining.
     */
    parseAuthorizationEndpointData(
        handler: (request: KaapiRequest<AuthRefs>) => Promise<AuthReqData>,
    ): this {
        this.parseAuthorizationEndpointDataHandler = handler;
        return this;
    }

    /**
     * Sets lifecycle handlers for the authorization endpoint, which are invoked before the main GET and POST handlers.
     * @param onPreHandler A lifecycle method or array of methods that are invoked before the main GET and POST handlers.
     * @returns `this` for chaining.
     */
    setOnPreHandler(onPreHandler: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined): this {
        this.onPreHandler = onPreHandler;
        return this;
    }

    /**
     * Sets the handler for post-processing the result of the authorization initiation step (GET request to the authorization endpoint).
     * @param onInitiateAuthorization A lifecycle method that receives the Kaapi request, response toolkit, and the result of the initiation step, allowing you to handle rendering a login page, handling errors, etc.
     * @returns `this` for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOnInitiateAuthorization<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>>
        (onInitiateAuthorization: KaapiAuthorizationCodeLifecycleMethod<R, V, AuthorizationCodeInitiationResponse> | undefined): this {
        this.onInitiateAuthorization = onInitiateAuthorization;
        return this;
    }

    /**
     * Sets the handler for post-processing the result of the authorization processing step (POST request to the authorization endpoint).
     * @param onProcessAuthorization A lifecycle method that receives the Kaapi request, response toolkit, and the result of the processing step, allowing you to handle rendering a login page, handling errors, etc.
     * @returns `this` for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOnProcessAuthorization<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>>
        (onProcessAuthorization: KaapiAuthorizationCodeLifecycleMethod<R, V, AuthorizationCodeProcessResponse> | undefined): this {
        this.onProcessAuthorization = onProcessAuthorization;
        return this;
    }

    /**
     * Sets the field name to use for the username in the default authorization endpoint form.
     * @param usernameField The name of the field to use for the username.
     * @returns `this` for chaining.
     */
    setUsernameField(usernameField: string): this {
        this.usernameField = usernameField;
        return this;
    }

    /**
     * Sets the field name to use for the password in the default authorization endpoint form.
     * @param passwordField The name of the field to use for the password.
     * @returns `this` for chaining.
     */
    setPasswordField(passwordField: string): this {
        this.passwordField = passwordField;
        return this;
    }

    /**
     * Sets a custom form renderer for the authorization endpoint. If not provided, a default login form will be rendered for GET requests, and a simple success/error response will be returned for POST requests.
     * @param renderer A custom form renderer function.
     * @returns `this` for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setLoginFormRenderer<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>>(renderer: LoginFormRenderer<R, V, AuthorizationCodeInitiationResponse | AuthorizationCodeProcessResponse>): this {
        this.loginFormRenderer = renderer;
        return this;
    }

    /**
     * Sets a custom consent form renderer for the authorization endpoint. If not provided, a default consent form will be rendered when the authorization processing step returns a "continue" result.
     * @param renderer A custom consent form renderer function.
     * @returns `this` for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConsentFormRenderer<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>, C extends AuthorizationCodeEndpointContext = AuthorizationCodeEndpointContext>(renderer: AuthorizationCodeConsentFormRenderer<R, V, C>): this {
        this.consentFormRenderer = renderer;
        return this;
    }



    /**
     * Builds and returns a configured {@link KaapiAuthorizationCodeFlow} instance.
     *
     * @returns A new `KaapiAuthorizationCodeFlow`.
     */
    override build(): KaapiAuthorizationCodeFlow<Refs, AuthReqData, AuthRefs> {
        const params: KaapiAuthorizationCodeFlowOptions<AuthReqData, Refs, AuthRefs> = {
            ...this.buildParams(),
            strategyOptions: this.strategyOptions,
            parseAuthorizationEndpointData: this.parseAuthorizationEndpointDataHandler,
            onPreHandler: this.onPreHandler,
            onInitiateAuthorization: this.onInitiateAuthorization,
            onProcessAuthorization: this.onProcessAuthorization,
            usernameField: this.usernameField,
            passwordField: this.passwordField,
            loginFormRenderer: this.loginFormRenderer,
            consentFormRenderer: this.consentFormRenderer,
        };
        return new KaapiAuthorizationCodeFlow<Refs, AuthReqData, AuthRefs>(params);
    }
}

//#endregion

//#region OIDC Classes

/**
 * Kaapi adapter for the OAuth 2.0 Authorization Code flow.
 *
 * Wraps {@link OIDCAuthorizationCodeFlow} to integrate natively with Kaapi's `Request`,
 * providing middleware for route protection and convenience methods for the
 * authorization and token endpoints.
 *
 * Use {@link KaapiOIDCAuthorizationCodeFlowBuilder} for a fluent configuration API.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 * @template AuthReqData - The shape of the parsed authorization request data.
 * @template AuthRefs - The Kaapi `ReqRef` type for the authorization request.
 */
export class KaapiOIDCAuthorizationCodeFlow<
    Refs extends ReqRef = ReqRefDefaults,
    AuthReqData extends AuthorizationCodeReqData = AuthorizationCodeReqData,
    AuthRefs extends ReqRef = ReqRefDefaults

> extends OIDCAuthorizationCodeFlow<AuthReqData> implements KaapiAdapted<Refs> {
    readonly #tokenVerifier: (
        request: KaapiRequest<Refs>,
    ) => Promise<StrategyResult>;
    readonly #authorizeMiddleware: AuthSchemeHandler<Refs>;

    readonly #failedAuthorizationAction: FailedAuthorizationAction<Refs>;

    readonly #parseAuthorizationEndpointData: (
        request: KaapiRequest<AuthRefs>,
    ) => Promise<AuthReqData>;

    readonly #usernameField?: string | undefined;
    readonly #passwordField?: string | undefined;

    readonly #onPreHandler?: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #onInitiateAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, OIDCAuthorizationCodeInitiationResponse> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #onProcessAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, OIDCAuthorizationCodeProcessResponse> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #loginFormRenderer?: LoginFormRenderer<any, any, OIDCAuthorizationCodeInitiationResponse | OIDCAuthorizationCodeProcessResponse> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #consentFormRenderer?: AuthorizationCodeConsentFormRenderer<any, any, OIDCAuthorizationCodeEndpointContext> | undefined;

    readonly #kaapi: KaapiOIDCAuthorizationCodeMethods<Refs, AuthRefs> = {
        authorizeMiddleware: (scopes?: string[]): AuthSchemeHandler<Refs> => {
            return scopes?.length ? this.#createAuthorizeMiddleware(scopes) : this.#authorizeMiddleware;
        },
        token: async (request: KaapiRequest<Refs>): Promise<OAuth2FlowTokenResponse> => {
            return await this.token(createWebStandardRequest(request));
        },

        verifyToken: async (request: KaapiRequest<Refs>): Promise<StrategyResult> => {
            return await this.#tokenVerifier(request);
        },

        initiateAuthorization: async <R extends ReqRef = ReqRefDefaults>(
            request: KaapiRequest<R>,
        ): Promise<OIDCAuthorizationCodeInitiationResponse> => {
            return await this.initiateAuthorization(createWebStandardRequest(request));
        },

        processAuthorization: async (
            request: KaapiRequest<AuthRefs>,
        ): Promise<AuthorizationCodeProcessResponse> => {
            return await this.processAuthorization(
                createWebStandardRequest(request),
                await this.#parseAuthorizationEndpointData(request),
            );
        },

        handleAuthorizationEndpoint: async <R extends ReqRef = ReqRefDefaults>(
            request: KaapiRequest<R>,
        ): Promise<AuthorizationCodeEndpointResponse> => {
            if (request.method === "get") {
                // In a real implementation, you would render a login page
                // or consent page here for the user
                // to authenticate and authorize the client.
                const result = await this.kaapi().initiateAuthorization(request);

                if (!result.success) {
                    return {
                        type: "error",
                        ...result,
                    };
                }

                return {
                    ...result,
                    type: "initiated",
                    method: "GET",
                };
            }

            if (request.method === "post") {
                // In a real implementation, you would authenticate the user here,
                // and if authentication is successful, generate an authorization code,
                // and redirect the user to the redirect_uri with the code and state as query parameters.

                const result = await this.kaapi().processAuthorization(request as unknown as KaapiRequest<AuthRefs>);

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
                redirectable: false,
            };
        },

        toAuthDesign: () => {
            const schemeName = this.getSecuritySchemeName();
            const description = this.getDescription();
            const tokenEndpoint = this.getTokenEndpoint();
            const tokenType = this.tokenType;
            const authEndpoint = this.getAuthorizationEndpoint();
            const tokenHandler = this.token.bind(this);
            const tokenVerifierHandler = this.#kaapi.verifyToken.bind(this);
            const initAuthorization = this.kaapi().initiateAuthorization.bind(this);
            const processAuthorization = this.kaapi().processAuthorization.bind(this);
            const onPreHandler = this.#onPreHandler;
            const onInitiateAuthorization = this.#onInitiateAuthorization;
            const onProcessAuthorization = this.#onProcessAuthorization;
            const usernameField = this.getUsernameField();
            const passwordField = this.getPasswordField();
            const renderLoginForm = this.#loginFormRenderer || renderDefaultLoginForm;
            const renderConsentForm = this.#consentFormRenderer || renderDefaultConsentForm;

            const discoveryUrl = this.getDiscoveryUrl();

            // const supported = this.getTokenEndpointAuthMethods();
            // const scopes = this.getScopes();

            return new OAuth2AuthDesign({
                docs(): OIDCAuthUtil {
                    const docs = new OIDCAuthUtil(schemeName)
                        .setDiscoveryUrl(discoveryUrl);
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

                    // authorization endpoint
                    t.route({
                        options: {
                            ...routesOptions,
                            ext: {
                                onPreHandler: onPreHandler,
                            }
                        },
                        path: authEndpoint,
                        method: 'GET',
                        handler: async (req, h) => {
                            //try {
                            const result = await initAuthorization(req);

                            // handle post initiation logic (e.g. rendering login page, handling errors, etc.) in the onInitiateAuthorization lifecycle method
                            if (onInitiateAuthorization) {
                                return await onInitiateAuthorization.call(h, req, h, result);
                            }

                            // default handling if not handled in post handling
                            if (result.success) {
                                return renderLoginForm(
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    req as any,
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    h as any,
                                    result,
                                    {
                                        statusCode: 200,
                                        usernameField,
                                        passwordField
                                    }
                                );
                            }
                            return h.response({ error: "invalid_request" }).code(400);
                            //} catch (_error) {
                            //    // TODO: error handling or ...
                            //
                            //    // default error handling if not handled in error handling
                            //    return h.response({ error: "server_error" }).code(500);
                            //}
                        },
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

                            // handle post initiation logic (e.g. rendering login page, handling errors, etc.) in the onProcessAuthorization lifecycle method
                            if (onProcessAuthorization) {
                                return await onProcessAuthorization.call(h, req, h, result);
                            }

                            // default handling if not handled in post handling
                            if (result.type === "error") {
                                const error = result.error;
                                if (result.redirectable) {
                                    const qs = [
                                        `error=${encodeURIComponent(error instanceof AccessDeniedError ? error.errorCode : "invalid_request")}`,
                                        `error_description=${encodeURIComponent(
                                            error instanceof AccessDeniedError ? error.message : "Invalid request"
                                        )}`,
                                        result.state ? `state=${encodeURIComponent(result.state)}` : null,
                                    ]
                                        .filter(Boolean)
                                        .join("&");
                                    return h.redirect(`${result.redirectUri}?${qs}`);
                                }
                                return renderLoginForm(
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    req as any,
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    h as any,
                                    result,
                                    {
                                        statusCode: 400,
                                        errorMessage: error.message,
                                        usernameField,
                                        passwordField
                                    }
                                );
                            }

                            if (result.type === "code") {
                                const {
                                    code,
                                    context: { state, redirectUri },
                                } = result.authorizationCodeResponse;
                                const searchParams = new URLSearchParams();
                                searchParams.set("code", code);
                                if (state) searchParams.set("state", state);
                                return h.redirect(`${redirectUri}?${searchParams.toString()}`);
                            }

                            if (result.type === "continue") {
                                return renderConsentForm(
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    req as any,
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    h as any,
                                    result,
                                    {
                                        statusCode: 200,
                                        usernameField,
                                        passwordField
                                    }
                                );
                            }

                            if (result.type === "unauthenticated") {
                                return renderLoginForm(
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    req as any,
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    h as any,
                                    result,
                                    {
                                        statusCode: 400,
                                        errorMessage: result.message || "Authentication failed. Please try again.",
                                        usernameField,
                                        passwordField
                                    }
                                );
                            }

                            return renderLoginForm(
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                req as any,
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                h as any,
                                result,
                                {
                                    statusCode: 400,
                                    errorMessage: "Could not process the request. Please try again.",
                                    usernameField,
                                    passwordField
                                }
                            );
                        },
                    });
                },

                getStrategyName(): string {
                    return schemeName;
                },
            });
        }
    };

    constructor(options: KaapiOIDCAuthorizationCodeFlowOptions<AuthReqData, Refs, AuthRefs>) {
        const { strategyOptions, ...flowOptions } = options;

        super({
            ...flowOptions,
            strategyOptions: {},
        });

        this.#failedAuthorizationAction = strategyOptions.failedAuthorizationAction ?? (async () => {
            const Boom = await import('@hapi/boom');
            return Boom.unauthorized(null, this.tokenType);
        });

        this.#parseAuthorizationEndpointData = options.parseAuthorizationEndpointData;

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

        this.#onPreHandler = options.onPreHandler;
        this.#onInitiateAuthorization = options.onInitiateAuthorization;
        this.#onProcessAuthorization = options.onProcessAuthorization;

        this.#usernameField = options.usernameField;
        this.#passwordField = options.passwordField;

        this.#loginFormRenderer = options.loginFormRenderer;
        this.#consentFormRenderer = options.consentFormRenderer;
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
    kaapi(): Readonly<KaapiAuthorizationCodeMethods<Refs, AuthRefs>> {
        return Object.freeze(this.#kaapi);
    }

    getUsernameField(): string {
        return this.#usernameField || 'username';
    }

    getPasswordField(): string {
        return this.#passwordField || 'password';
    }
}

//#endregion

//#region OIDC Builders

/**
 * Fluent builder for {@link KaapiOIDCAuthorizationCodeFlow}.
 *
 * Provides a chainable API to configure all aspects of the Authorization Code flow
 * for Kaapi, including client lookup, token generation, token verification, scope
 * enforcement, and authorization endpoint data parsing.
 *
 * @template Refs - The Kaapi `ReqRef` type for the application.
 * @template AuthReqData - The shape of the parsed authorization request data.
 * @template AuthRefs - The Kaapi `ReqRef` type for the authorization request.
 *
 * @example
 * ```ts
 * const flow = KaapiOIDCAuthorizationCodeFlowBuilder
 *   .create({ parseAuthorizationEndpointData: (c) => parseFormData(c) })
 *   .setTokenEndpoint("/token")
 *   .tokenVerifier((c, { token }) => verifyJwt(token))
 *   .build();
 * ```
 */
export class KaapiOIDCAuthorizationCodeFlowBuilder<
    Refs extends ReqRef = ReqRefDefaults,
    AuthReqData extends AuthorizationCodeReqData = AuthorizationCodeReqData,
    AuthRefs extends ReqRef = ReqRefDefaults
> extends OIDCAuthorizationCodeFlowBuilder<AuthReqData> {
    protected strategyOptions: KaapiOAuth2StrategyOptions<Refs> = {};
    protected parseAuthorizationEndpointDataHandler: (
        request: KaapiRequest<AuthRefs>,
    ) => Promise<AuthReqData>;
    protected onPreHandler?: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected onInitiateAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, OIDCAuthorizationCodeInitiationResponse> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected onProcessAuthorization?: KaapiAuthorizationCodeLifecycleMethod<any, any, OIDCAuthorizationCodeProcessResponse> | undefined;
    protected usernameField?: string | undefined;
    protected passwordField?: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected loginFormRenderer?: LoginFormRenderer<any, any, OIDCAuthorizationCodeInitiationResponse | OIDCAuthorizationCodeProcessResponse> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected consentFormRenderer?: AuthorizationCodeConsentFormRenderer<any, any, any> | undefined;

    constructor(options: KaapiOIDCAuthorizationCodeFlowBuilderOptions<AuthReqData, Refs, AuthRefs>) {
        const { strategyOptions, parseAuthorizationEndpointData, ...flowOptions } = options;
        super({
            ...flowOptions,
            strategyOptions: {},
        });
        this.strategyOptions = strategyOptions || {};
        this.parseAuthorizationEndpointDataHandler = parseAuthorizationEndpointData;
    }

    /**
     * Creates a new `KaapiOIDCAuthorizationCodeFlowBuilder` instance.
     *
     * @param options - Initial builder options. `parseAuthorizationEndpointData` is required.
     * @returns A new builder instance.
     */
    static create<
        Refs extends ReqRef = ReqRefDefaults,
        AuthReqData extends AuthorizationCodeReqData = AuthorizationCodeReqData,
    >(
        options: KaapiOIDCAuthorizationCodeFlowBuilderOptions<AuthReqData, Refs>,
    ): KaapiOIDCAuthorizationCodeFlowBuilder<Refs, AuthReqData> {
        return new KaapiOIDCAuthorizationCodeFlowBuilder<Refs, AuthReqData>(options);
    }

    /**
     * Sets the action to invoke when authorization fails (e.g. missing or invalid token).
     *
     * @param action - A handler that receives the Kaapi request and the authorization error.
     * @returns `this` for chaining.
     */
    failedAuthorizationAction(action: FailedAuthorizationAction<Refs>): this {
        this.strategyOptions.failedAuthorizationAction = action;
        return this;
    }

    /**
     * This method does not have access to the Kaapi request.
     * Use `tokenVerifier` instead to set a handler that receives the Kaapi request.
     * @deprecated Use `tokenVerifier` instead to set a handler that receives the Kaapi request.
     * @param handler - A function that receives a standard Web `Request` and token params.
     * @returns `this` for chaining.
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
     * Sets the handler used to parse authorization request data from the Kaapi request on POST requests.
     *
     * @param handler - Async function that extracts and returns the authorization request data.
     * @returns `this` for chaining.
     */
    parseAuthorizationEndpointData(
        handler: (request: KaapiRequest<AuthRefs>) => Promise<AuthReqData>,
    ): this {
        this.parseAuthorizationEndpointDataHandler = handler;
        return this;
    }

    /**
     * Sets lifecycle handlers for the authorization endpoint, which are invoked before the main GET and POST handlers.
     * @param onPreHandler A lifecycle method or array of methods that are invoked before the main GET and POST handlers.
     * @returns `this` for chaining.
     */
    setOnPreHandler(onPreHandler: RouteExtObject<ReqRefDefaults> | RouteExtObject<ReqRefDefaults>[] | undefined): this {
        this.onPreHandler = onPreHandler;
        return this;
    }

    /**
     * Sets the handler for post-processing the result of the authorization initiation step (GET request to the authorization endpoint).
     * @param onInitiateAuthorization A lifecycle method that receives the Kaapi request, response toolkit, and the result of the initiation step, allowing you to handle rendering a login page, handling errors, etc.
     * @returns `this` for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOnInitiateAuthorization<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>>
        (onInitiateAuthorization: KaapiAuthorizationCodeLifecycleMethod<R, V, OIDCAuthorizationCodeInitiationResponse> | undefined): this {
        this.onInitiateAuthorization = onInitiateAuthorization;
        return this;
    }

    /**
     * Sets the handler for post-processing the result of the authorization processing step (POST request to the authorization endpoint).
     * @param onProcessAuthorization A lifecycle method that receives the Kaapi request, response toolkit, and the result of the processing step, allowing you to handle rendering a login page, handling errors, etc.
     * @returns `this` for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOnProcessAuthorization<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>>
        (onProcessAuthorization: KaapiAuthorizationCodeLifecycleMethod<R, V, OIDCAuthorizationCodeProcessResponse> | undefined): this {
        this.onProcessAuthorization = onProcessAuthorization;
        return this;
    }

    /**
     * Sets the field name to use for the username in the default authorization endpoint form.
     * @param usernameField The name of the field to use for the username.
     * @returns `this` for chaining.
     */
    setUsernameField(usernameField: string): this {
        this.usernameField = usernameField;
        return this;
    }

    /**
     * Sets the field name to use for the password in the default authorization endpoint form.
     * @param passwordField The name of the field to use for the password.
     * @returns `this` for chaining.
     */
    setPasswordField(passwordField: string): this {
        this.passwordField = passwordField;
        return this;
    }

    /**
     * Sets a custom form renderer for the authorization endpoint. If not provided, a default login form will be rendered for GET requests, and a simple success/error response will be returned for POST requests.
     * @param renderer A custom form renderer function.
     * @returns `this` for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setLoginFormRenderer<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>>(renderer: LoginFormRenderer<R, V, OIDCAuthorizationCodeInitiationResponse | OIDCAuthorizationCodeProcessResponse>): this {
        this.loginFormRenderer = renderer;
        return this;
    }

    /**
     * Sets a custom consent form renderer for the authorization endpoint. If not provided, a default consent form will be rendered when the authorization processing step returns a "continue" result.
     * @param renderer A custom consent form renderer function.
     * @returns `this` for chaining.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConsentFormRenderer<R extends ReqRef = ReqRefDefaults, V extends Lifecycle.ReturnValue<any> = Lifecycle.ReturnValue<R>, C extends OIDCAuthorizationCodeEndpointContext = OIDCAuthorizationCodeEndpointContext>(renderer: AuthorizationCodeConsentFormRenderer<R, V, C>): this {
        this.consentFormRenderer = renderer;
        return this;
    }



    /**
     * Builds and returns a configured {@link KaapiOIDCAuthorizationCodeFlow} instance.
     *
     * @returns A new `KaapiOIDCAuthorizationCodeFlow`.
     */
    override build(): KaapiOIDCAuthorizationCodeFlow<Refs, AuthReqData, AuthRefs> {
        const params: KaapiOIDCAuthorizationCodeFlowOptions<AuthReqData, Refs, AuthRefs> = {
            ...this.buildParams(),
            strategyOptions: this.strategyOptions,
            parseAuthorizationEndpointData: this.parseAuthorizationEndpointDataHandler,
            onPreHandler: this.onPreHandler,
            onInitiateAuthorization: this.onInitiateAuthorization,
            onProcessAuthorization: this.onProcessAuthorization,
            usernameField: this.usernameField,
            passwordField: this.passwordField,
            loginFormRenderer: this.loginFormRenderer,
            consentFormRenderer: this.consentFormRenderer,
        };
        return new KaapiOIDCAuthorizationCodeFlow<Refs, AuthReqData, AuthRefs>(params);
    }
}

//#endregion
