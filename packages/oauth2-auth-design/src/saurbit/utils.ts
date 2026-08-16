import { WebStandardRequestOptions } from './types';
import type { Request as KaapiRequest, KaapiTools, Lifecycle, ReqRef, ReqRefDefaults } from '@kaapi/kaapi';
import {
    AccessDeniedError,
    AuthorizationPendingError,
    ExpiredTokenError,
    OAuth2Errors,
    OAuth2FlowTokenResponse,
    SlowDownError,
    StrategyResult,
    UnauthorizedClientError,
    UnsupportedGrantTypeError,
} from '@saurbit/oauth2';
import { createHash } from 'crypto';

/**
 * Converts a Kaapi (Hapi) {@link KaapiRequest} into a Web Standard {@link Request}.
 *
 * Bridges Hapi's request model to the Fetch API `Request` object expected by
 * libraries such as `@saurbit/oauth2`. Headers are forwarded as-is; for
 * mutation methods (`POST`, `PUT`, `PATCH`) the payload is serialised to
 * a URL-encoded string or JSON depending on the `content-type` header.
 *
 * @template Refs - Kaapi request reference types for the application.
 *
 * @param request - The incoming Kaapi {@link KaapiRequest} to convert.
 * @param options - Optional settings to control URL construction.
 * @returns A Web Standard {@link Request} ready for consumption by fetch-based libraries.
 */
export function createWebStandardRequest<Refs extends ReqRef = ReqRefDefaults>(
    request: KaapiRequest<Refs>,
    options?: WebStandardRequestOptions
): Request {
    // Build the absolute URL required by the Request constructor
    const origin = options?.origin ?? request.url.origin; // Use provided origin or fallback to request's origin
    const fullUrl = `${origin}${request.url.pathname}${request.url.search}`;

    // Build the Web Standard Request options object
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
        if (value) headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }
    const requestOptions: {
        method: string;
        headers: Headers;
        body?: BodyInit | null | undefined;
    } = {
        method: request.method.toUpperCase(),
        headers: new Headers(headers), // Uses web-standard Headers API
    };

    // Attach the body if it is a mutation request
    if (['POST', 'PUT', 'PATCH'].includes(requestOptions.method)) {
        // Check if the content-type matches URL-encoded form data
        const isUrlEncoded = request.headers['content-type']?.includes('application/x-www-form-urlencoded');

        if (isUrlEncoded && request.payload) {
            // Convert Hapi's parsed key-value payload object into a standard URL search string
            const searchParams = new URLSearchParams();

            for (const [key, value] of Object.entries(request.payload)) {
                searchParams.append(key, value);
            }

            requestOptions.body = searchParams.toString();

            // Explicitly set the proper Web standard header value
            requestOptions.headers.set('content-type', 'application/x-www-form-urlencoded');
        } else {
            // If parsed JSON/object, stringify it; if buffer/stream, pass directly
            requestOptions.body =
                request.payload && typeof request.payload === 'object'
                    ? JSON.stringify(request.payload)
                    : request.payload;
        }
    }

    // Create the native Web Standard Request instance
    return new Request(fullUrl, requestOptions);
}

/**
 * Creates a Hapi route handler that delegates token issuance to an OAuth 2.0 flow's
 * `token` method and formats the response according to the OAuth 2.0 specification.
 *
 * Converts the incoming Kaapi `Request` to a Web Standard `Request` before calling
 * the token handler, and maps flow errors to appropriate HTTP 400 responses.
 *
 * @param t - The Kaapi tools object used for logging.
 * @param tokenHandler - Async function that processes a Web Standard `Request` and returns
 *   an {@link OAuth2FlowTokenResponse}.
 * @returns A Hapi lifecycle method suitable for use as a route handler.
 */
export function createTokenEndpointHandler(
    t: KaapiTools,
    tokenHandler: (request: Request) => Promise<OAuth2FlowTokenResponse>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Lifecycle.Method<any, Lifecycle.ReturnValue<any>> {
    return async (req, h) => {
        const result = await tokenHandler(createWebStandardRequest(req));
        if (result.success) {
            return result.tokenResponse;
        }
        let error = result.error;
        if (error instanceof OAuth2Errors) {
            const tmperror = error.errors.find((e) => !(e instanceof UnsupportedGrantTypeError));
            if (tmperror) {
                error = tmperror;
            } else if (error.errors.length > 0) {
                error = error.errors[0];
            }
        }
        if (
            error instanceof UnsupportedGrantTypeError ||
            error instanceof UnauthorizedClientError ||
            error instanceof AccessDeniedError ||
            error instanceof ExpiredTokenError ||
            error instanceof AuthorizationPendingError ||
            error instanceof UnsupportedGrantTypeError ||
            error instanceof SlowDownError
        ) {
            t.log.warn({ error, message: error.message });
            return h
                .response({
                    error: error.errorCode,
                    errorDescription: error.message,
                    error_uri: error.errorUri,
                })
                .code(error.statusCode);
        }
        t.log.error({ error, message: error.message });
        return h.response({ error: 'invalid_request' }).code(400);
    };
}

/**
 * Registers a Hapi auth scheme and a default strategy on the server for an OAuth 2.0 flow.
 *
 * The scheme's `authenticate` hook extracts and verifies the bearer token using
 * `tokenVerifierHandler`. On success it calls `h.authenticated`; on failure it
 * returns an unauthenticated response with a `WWW-Authenticate` challenge.
 *
 * @param t - The Kaapi tools object used to call `t.scheme` and `t.strategy`.
 * @param schemeName - Name for both the Hapi auth scheme and the strategy.
 * @param tokenType - Token type string included in the `WWW-Authenticate` challenge (e.g. `"Bearer"`).
 * @param tokenVerifierHandler - Async function that verifies the token extracted from the
 *   incoming {@link KaapiRequest} and returns a {@link StrategyResult}.
 */
export function createSchemeAndStrategy<Refs extends ReqRef = ReqRefDefaults>(
    t: KaapiTools,
    schemeName: string,
    tokenType: string,
    tokenVerifierHandler: (request: KaapiRequest<Refs>) => Promise<StrategyResult>
): void {
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
}

/**
 * Verifies the code_verifier against a previously saved code_challenge.
 *
 * Implements the PKCE (RFC 7636) S256 verification: hashes `codeVerifier` with
 * SHA-256, encodes the result as Base64url, and compares it to `codeChallenge`.
 *
 * @param codeVerifier - The plain-text code verifier sent by the client at the token endpoint.
 * @param codeChallenge - The Base64url-encoded SHA-256 hash of the code verifier, previously
 *   stored during the authorization request.
 * @returns `true` if the verifier matches the challenge; `false` otherwise.
 */
export function verifyCodeVerifier(codeVerifier: string, codeChallenge: string) {
    const base64 = createHash('sha256').update(codeVerifier).digest('base64');

    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return base64url === codeChallenge;
}
