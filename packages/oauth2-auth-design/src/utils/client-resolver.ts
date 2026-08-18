import {
    AuthorizationCodeTokenRequest,
    DeviceAuthorizationTokenRequest,
    OAuth2GetClientFunction,
    OAuth2RefreshTokenRequest,
} from '@saurbit/oauth2';

/**
 * Utility type that ensures at least one property of the given type `T` is present.
 */
export type AtLeastOne<T> = NonNullable<
    {
        [K in keyof T]: Required<Pick<T, K>> & Partial<Omit<T, K>>;
    }[keyof T]
>;

/**
 * Represents an OAuth2 token request, which can be one of the following types:
 * - Authorization Code Token Request
 * - Device Authorization Token Request
 * - Refresh Token Request
 *
 * This type is used to determine the appropriate client resolver based on the grant type.
 */
export type OAuth2TokenRequest =
    AuthorizationCodeTokenRequest | DeviceAuthorizationTokenRequest | OAuth2RefreshTokenRequest;

/**
 * Determines if the given token request is an Authorization Code Token Request.
 *
 * @param tokenRequest The OAuth2 token request to check.
 * @returns True if the token request is an Authorization Code Token Request; otherwise, false.
 */
function isAuthorizationCodeTokenRequest(
    tokenRequest: OAuth2TokenRequest
): tokenRequest is AuthorizationCodeTokenRequest {
    return !!(
        tokenRequest.grantType === 'authorization_code' &&
        tokenRequest.code &&
        tokenRequest.redirectUri &&
        tokenRequest.clientId &&
        tokenRequest.tokenTypeValidation
    );
}

/**
 * Determines if the given token request is a Device Authorization Token Request.
 *
 * @param tokenRequest The OAuth2 token request to check.
 * @returns True if the token request is a Device Authorization Token Request; otherwise, false.
 */
function isDeviceAuthorizationTokenRequest(
    tokenRequest: OAuth2TokenRequest
): tokenRequest is DeviceAuthorizationTokenRequest {
    return !!(
        tokenRequest.grantType === 'urn:ietf:params:oauth:grant-type:device_code' &&
        tokenRequest.deviceCode &&
        tokenRequest.clientId &&
        tokenRequest.tokenTypeValidation
    );
}

/**
 * Determines if the given token request is a Refresh Token Request.
 *
 * @param tokenRequest The OAuth2 token request to check.
 * @returns True if the token request is a Refresh Token Request; otherwise, false.
 */
function isRefreshTokenRequest(tokenRequest: OAuth2TokenRequest): tokenRequest is OAuth2RefreshTokenRequest {
    return !!(
        tokenRequest.grantType === 'refresh_token' &&
        tokenRequest.refreshToken &&
        tokenRequest.clientId &&
        tokenRequest.tokenTypeValidation
    );
}

/**
 * Handlers for resolving the client for different OAuth2 token request types (grant types).
 *
 * Each handler is a function that takes the corresponding token request and returns the resolved client.
 */
export type OAuth2TokenRequestHandlers = {
    authorizationCode?: OAuth2GetClientFunction<AuthorizationCodeTokenRequest>;
    deviceAuthorization?: OAuth2GetClientFunction<DeviceAuthorizationTokenRequest>;
    refreshToken?: OAuth2GetClientFunction<OAuth2RefreshTokenRequest>;
};

/**
 * Resolves the client for a given OAuth2 token request using the provided handlers.
 *
 * @param tokenRequest The OAuth2 token request object.
 * @param handlers The handlers for different OAuth2 token request types (grant types).
 * @returns The resolved client or undefined if no handler matches.
 */
export function resolveClient(
    tokenRequest: OAuth2TokenRequest,
    handlers: AtLeastOne<OAuth2TokenRequestHandlers>
): ReturnType<OAuth2GetClientFunction<OAuth2TokenRequest>> {
    if (isAuthorizationCodeTokenRequest(tokenRequest) && handlers.authorizationCode) {
        return handlers.authorizationCode(tokenRequest);
    } else if (isDeviceAuthorizationTokenRequest(tokenRequest) && handlers.deviceAuthorization) {
        return handlers.deviceAuthorization(tokenRequest);
    } else if (isRefreshTokenRequest(tokenRequest) && handlers.refreshToken) {
        return handlers.refreshToken(tokenRequest);
    } else {
        return undefined;
    }
}

/**
 * Creates a client resolver function using the provided handlers.
 *
 * @param handlers The handlers for different OAuth2 token request types (grant types).
 * @returns A function that resolves the client for a given OAuth2 token request.
 */
export function createClientResolver(
    handlers: AtLeastOne<OAuth2TokenRequestHandlers>
): (tokenRequest: OAuth2TokenRequest) => ReturnType<OAuth2GetClientFunction<OAuth2TokenRequest>> {
    return (tokenRequest: OAuth2TokenRequest): ReturnType<OAuth2GetClientFunction<OAuth2TokenRequest>> => {
        return resolveClient(tokenRequest, handlers);
    };
}
