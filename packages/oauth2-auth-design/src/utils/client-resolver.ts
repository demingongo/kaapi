import {
    AuthorizationCodeTokenRequest,
    DeviceAuthorizationTokenRequest,
    OAuth2GetClientFunction,
    OAuth2RefreshTokenRequest,
} from '@saurbit/oauth2';

export type AtLeastOne<T> = NonNullable<
    {
        [K in keyof T]: Required<Pick<T, K>> & Partial<Omit<T, K>>;
    }[keyof T]
>;

export type OAuth2TokenRequest =
    | AuthorizationCodeTokenRequest
    | DeviceAuthorizationTokenRequest
    | OAuth2RefreshTokenRequest;

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

function isRefreshTokenRequest(tokenRequest: OAuth2TokenRequest): tokenRequest is OAuth2RefreshTokenRequest {
    return !!(
        tokenRequest.grantType === 'refresh_token' &&
        tokenRequest.refreshToken &&
        tokenRequest.clientId &&
        tokenRequest.tokenTypeValidation
    );
}

export type OAuth2TokenRequestHandlers = {
    authorizationCode?: OAuth2GetClientFunction<AuthorizationCodeTokenRequest>;
    deviceAuthorization?: OAuth2GetClientFunction<DeviceAuthorizationTokenRequest>;
    refreshToken?: OAuth2GetClientFunction<OAuth2RefreshTokenRequest>;
};

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

export function createClientResolver(handlers: AtLeastOne<OAuth2TokenRequestHandlers>) {
    return (tokenRequest: OAuth2TokenRequest): ReturnType<OAuth2GetClientFunction<OAuth2TokenRequest>> => {
        return resolveClient(tokenRequest, handlers);
    };
}
