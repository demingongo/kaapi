import type { Request as KaapiRequest, KaapiTools, Lifecycle, ReqRef, ReqRefDefaults } from '@kaapi/kaapi';
import { OAuth2FlowTokenResponse, UnauthorizedClientError, UnsupportedGrantTypeError } from '@saurbit/oauth2';
import { WebStandardRequestOptions } from './types';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTokenEndpointHandler(t: KaapiTools, tokenHandler: (request: Request) => Promise<OAuth2FlowTokenResponse>): Lifecycle.Method<any, Lifecycle.ReturnValue<any>> {
    return async (req, h) => {
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
    }
}
