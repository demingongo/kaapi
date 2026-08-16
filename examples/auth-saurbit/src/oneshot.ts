/*************************************************
 * Example OpenID Connect Authorization Code Flow implementation using Kaapi.
 *
 * This example demonstrates how to set up an OpenID Connect Authorization Code Flow
 * using the @saurbit/oauth2 integration with the Kaapi web framework. It includes
 * handlers for the discovery, JWKS, authorization, token, and user info endpoints,
 * as well as a protected resource endpoint.
 *
 * The flow is configured with in-memory client and user data for demonstration purposes.
 * In a production application, you would typically integrate with a database or other
 * persistent storage for clients, users, and authorization codes.
 *
 * The example also includes error handling and logging for various failure scenarios.
 *
 * OpenAPI documentation is generated for the protected resource endpoint, and Scalar
 * is available for testing the API.
 *************************************************/
import Boom from '@hapi/boom';
import {
  applyModifiers,
  groupResponses,
  Kaapi,
  ReqRefDefaults,
  ResponseDocsModifier,
  ResponseObject,
} from '@kaapi/kaapi';
import {
  createClientResolver,
  KaapiOIDCAuthorizationCodeFlow,
  KaapiOIDCAuthorizationCodeFlowBuilder,
  renderDefaultConsentForm,
  renderDefaultLoginForm,
  verifyCodeVerifier,
} from '@kaapi/oauth2-auth-design';
import { UserCredentials } from '@saurbit/oauth2';
import { createInMemoryKeyStore, JoseJwksAuthority, JwksRotator } from '@saurbit/oauth2-jwt';
import { randomBytes, randomUUID } from 'crypto';
import hapiScalar from 'hapi-scalar';

declare module '@saurbit/oauth2' {
  interface UserCredentials {
    id: string;
    email: string;
    fullName: string;
    username: string;
  }
}

// External URI for the OpenID Connect provider ()
const EXTERNAL_URI = 'http://localhost:3000';

// OpenID Connect discovery endpoint path
const DISCOVERY_ENDPOINT_PATH = '/.well-known/openid-configuration';

// in-memory key store
const jwksStore = createInMemoryKeyStore();

// For signing JWTs and exposing the JWKS endpoint.
const jwksAuthority = new JoseJwksAuthority(jwksStore, 8.64e6); // 100 days key lifetime

// To rotate keys and clean up old keys from the store.
const jwksRotator = new JwksRotator({
  keyGenerator: jwksAuthority,
  rotationTimestampStore: jwksStore,
  rotationIntervalMs: 7.884e9, // 91 days
});

// Authorized clients
const AUTH_CLIENTS = [
  {
    id: 'example-client',
    secret: 'example-secret',
    grants: ['authorization_code'],
    redirectUris: ['http://localhost:3000/scalar'],
    scopes: ['openid', 'profile', 'email', 'offline_access', 'content:read', 'content:write'],
  },
];

// Authorized user
const AUTH_USERS = [
  {
    id: 'user123',
    fullName: 'John Doe',
    email: 'user@example.com',
    username: 'user',
    password: 'crossterm',
  },
];

// Authorization code storage
const codeStorage: Map<
  string,
  {
    clientId: string;
    scope: string[];
    userId: string;
    expiresAt: number;
    codeChallenge?: string | undefined;
    nonce?: string | undefined;
  }
> = new Map();

// Refresh token storage
const refreshTokenStorage: Map<
  string,
  {
    clientId: string;
    userId: string;
    scope: string[];
    expiresAt: number;
  }
> = new Map();

// Session storage for authenticated users
const sessionStorage: Map<
  string,
  {
    userId: string;
    expiresAt: number;
  }
> = new Map();

const COOKIE_SESSION_NAME = 'idp_session'; // Name of the cookie used to track user sessions
const COOKIE_SESSION_MAX_AGE = 4.32e7; // 12 hours (in milliseconds)
const COOKIE_PASSWORD = randomBytes(32).toString('base64url'); // Use a secure random password for cookie encryption
const REFRESH_TOKEN_LIFETIME = 2.592e9; // 30 days (in milliseconds)
const USER_NAME_FIELD = 'username'; // Name of the field in the login form for the username
const PASSWORD_FIELD = 'password'; // Name of the field in the login form for the password

/**
 * Creates a Boom error response with the specified error code and description.
 * @param errorCode The error code to include in the response.
 * @param errorDescription The error description to include in the response.
 * @returns A Boom error response with the specified error code and description.
 */
function createBoomError(errorCode: string, errorDescription: string): Boom.Boom<unknown> {
  const errorResponse = Boom.badRequest(errorCode);
  errorResponse.output.payload.error = errorCode;
  errorResponse.output.payload.error_description = errorDescription;
  return errorResponse;
}

// Build the OpenID Connect Authorization Code Flow using the Hono integration.
const flow: KaapiOIDCAuthorizationCodeFlow<
  ReqRefDefaults,
  {
    username: string | undefined;
    password: string | undefined;
    consent: 'allow' | 'deny' | undefined;
    cookieSession: string | undefined;
  }
> = KaapiOIDCAuthorizationCodeFlowBuilder.create({
  // Parse the request payload and cookies to extract relevant data for authorization
  parseAuthorizationEndpointData: async (req) => {
    const payload = req.payload as Record<string, unknown>;
    const username =
      typeof payload?.[USER_NAME_FIELD] === 'string' ? payload[USER_NAME_FIELD] : undefined;
    const password =
      typeof payload?.[PASSWORD_FIELD] === 'string' ? payload[PASSWORD_FIELD] : undefined;
    const consent =
      typeof payload?.consent === 'string' && ['allow', 'deny'].includes(payload.consent)
        ? (payload.consent as 'allow' | 'deny')
        : undefined;
    const cookieSession =
      req.state[COOKIE_SESSION_NAME] && typeof req.state[COOKIE_SESSION_NAME] === 'string'
        ? req.state[COOKIE_SESSION_NAME]
        : undefined;

    console.log('parseAuthorizationEndpointData:', { username, password, consent, cookieSession });
    return {
      username,
      password,
      consent,
      cookieSession,
    };
  },
})
  .setSecuritySchemeName('openidConnect')
  .setScopes({
    openid: 'OpenID Connect scope',
    profile: 'Access to your profile information',
    email: 'Access to your email address',
    offline_access: 'Access to refresh tokens for offline access',
    'content:read': 'Access to read content',
    'content:write': 'Access to write content',
  })
  .setDescription('Example OpenID Connect Authorization Code Flow')
  // OpenID Connect discovery endpoint handler
  .setDiscoveryUrl(DISCOVERY_ENDPOINT_PATH)
  .onDiscoveryRequest(async (request) => {
    return flow.kaapi().getDiscoveryConfiguration(request, {
      origin: EXTERNAL_URI,
    });
  })
  // JWKS endpoint handler
  .setJwksEndpoint('/.well-known/jwks.json')
  .onJwksRequest(async () => {
    return await jwksAuthority.getJwksEndpointResponse();
  })
  .setAuthorizationEndpoint('/authorize')
  .setTokenEndpoint('/token')
  .setUserInfoEndpoint('/userinfo')
  .clientSecretPostAuthenticationMethod()
  .noneAuthenticationMethod()
  .setAccessTokenLifetime(3600)
  .setOpenIdConfiguration({
    claims_supported: ['sub', 'aud', 'iss', 'exp', 'iat', 'nbf', 'name', 'email', 'username'],
  })
  .getClientForAuthentication((data) => {
    // Look up the client by ID/secret and return it, or undefined if not found.
    const client = AUTH_CLIENTS.find((c) => c.id === data.clientId);
    if (!client) return;

    // filter client's allowed scoped
    const requestedScopes = data.scope ? data.scope : [];
    const grantedScopes = requestedScopes.length
      ? requestedScopes.filter((s) => client.scopes.includes(s))
      : client.scopes;
    if (grantedScopes.length === 0) return;

    return {
      id: client.id,
      grants: client.grants,
      redirectUris: client.redirectUris,
      scopes: client.scopes,
    };
  })
  .getUserForAuthentication((_ctxt, parsedData) => {
    // get user from session cookie if available
    if (parsedData.cookieSession) {
      const session = sessionStorage.get(parsedData.cookieSession);
      if (session) {
        if (session.expiresAt <= Date.now()) {
          // Session expired, clean up
          sessionStorage.delete(parsedData.cookieSession);
        } else if (session.expiresAt > Date.now()) {
          const user = AUTH_USERS.find((u) => u.id === session.userId);
          if (user) {
            return {
              type: 'authenticated',
              user: {
                id: user.id,
                email: user.email,
                username: user.username,
                consentStatus: parsedData.consent, // carry the consent decision  forward
              },
            };
          }
        }
      }
    }

    // get user from username/password if available
    const user = AUTH_USERS.find(
      (u) => u.username === parsedData.username && u.password === parsedData.password
    );
    if (!user) return;
    return {
      type: 'authenticated',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    };
  })
  .setConsentFormRenderer(async (request, h, result, ctxt) => {
    // Render the default consent form for the user to authorize the client to access their resources.
    const response = await renderDefaultConsentForm(request, h, result, ctxt);

    if (response && !request.state[COOKIE_SESSION_NAME]) {
      // set a cookie to track session
      const sessionId = randomUUID();
      sessionStorage.set(sessionId, {
        userId: `${result.continueResponse.user.id}`,
        expiresAt: Date.now() + COOKIE_SESSION_MAX_AGE,
      });
      (response as ResponseObject).state(COOKIE_SESSION_NAME, sessionId);
    }

    return response;
  })
  .onPreHandler({
    // This method is called before the request is processed by the authorization endpoint handler.
    // It checks if the request is a GET request and if there is a valid session cookie.
    // If a valid session exists, it processes the authorization request and renders the consent form.
    // If the session is invalid or expired, it clears the session cookie and shows the login form.
    method: async (request, h) => {
      if (request.method != 'get') {
        return h.continue;
      }

      const cookieSession =
        typeof request.state[COOKIE_SESSION_NAME] === 'string'
          ? request.state[COOKIE_SESSION_NAME]
          : undefined;
      if (cookieSession) {
        try {
          const session = sessionStorage.get(cookieSession);
          if (session) {
            if (session.expiresAt <= Date.now()) {
              // Session expired, clean up
              sessionStorage.delete(cookieSession);
            } else {
              const user = AUTH_USERS.find((u) => u.id === session.userId);
              if (user) {
                const processedAuthorization = await flow.kaapi().processAuthorization(request);
                // Render consent page if we have a valid session
                if (processedAuthorization.type === 'continue') {
                  // refresh session expiration
                  sessionStorage.set(cookieSession, {
                    ...session,
                    expiresAt: Date.now() + COOKIE_SESSION_MAX_AGE,
                  });
                  return (
                    renderDefaultConsentForm(request, h, processedAuthorization, {
                      statusCode: 200,
                      passwordField: PASSWORD_FIELD,
                      usernameField: USER_NAME_FIELD,
                    }) as ResponseObject
                  )
                    .state(COOKIE_SESSION_NAME, cookieSession)
                    .takeover();
                }

                // If the session is invalid, clear the session cookie and show the login form
                if (processedAuthorization.type === 'unauthenticated') {
                  sessionStorage.delete(cookieSession);
                  return (
                    renderDefaultLoginForm(request, h, processedAuthorization, {
                      statusCode: 200,
                      passwordField: PASSWORD_FIELD,
                      usernameField: USER_NAME_FIELD,
                    }) as ResponseObject
                  )
                    .unstate(COOKIE_SESSION_NAME)
                    .takeover();
                }

                // For any other errors, show the error message
                if (processedAuthorization.type === 'error') {
                  return h.response({ error: 'invalid_request' }).code(400).takeover();
                }
              } else {
                // User not found, clean up session
                sessionStorage.delete(cookieSession);
              }
            }
          }
        } catch (error) {
          console.error(error);
        }
      }
      return h.continue;
    },
  })
  .generateAuthorizationCode((grantContext, user) => {
    // invalid user, return undefined to indicate an error
    if (!user.id) {
      return;
    }

    // acces denied
    if (user.consentStatus === 'deny') {
      return {
        type: 'deny',
        message: 'The user has denied consent for this application.',
      };
    }

    // user consented
    if (user.consentStatus === 'allow') {
      const code = randomUUID();
      codeStorage.set(code, {
        clientId: grantContext.client.id,
        scope: grantContext.scope,
        userId: `${user.id}`,
        expiresAt: Date.now() + 60000,
        codeChallenge: grantContext.codeChallenge,
        nonce: grantContext.nonce,
      });
      return {
        type: 'code',
        code,
      };
    }

    // user has not yet provided consent, continue to the consent form
    return { type: 'continue' };
  })
  .getClient(async (tokenRequest) => {
    const client = AUTH_CLIENTS.find((c) => c.id === tokenRequest.clientId);
    if (!client) return;

    return await createClientResolver({
      // Validate the authorization code and its association with the client, and return the client, associated user and scope.
      authorizationCode: async ({ code, clientId, clientSecret, codeVerifier }) => {
        const codeData = codeStorage.get(code);
        if (!codeData) return; // Invalid or expired authorization code
        codeStorage.delete(code); // remove the code after use
        if (codeData.clientId !== clientId) return; // Authorization code was not issued to this client
        if (codeData.expiresAt < Date.now()) return; // Authorization code has expired

        const scope = codeData.scope;
        const codeChallenge = codeData.codeChallenge;
        const userId = codeData.userId;
        const nonce = codeData.nonce;

        const user = AUTH_USERS.find((u) => u.id === codeData.userId);
        if (!user) return; // User associated with the code does not exist

        // secret or code verifier validation
        if (clientSecret) {
          if (client.secret != clientSecret) {
            return; // Invalid client secret
          }
        } else if (codeVerifier && codeChallenge) {
          // Public client — verify PKCE code_verifier against the stored code_challenge
          if (!verifyCodeVerifier(codeVerifier, codeChallenge)) {
            return; // PKCE verification failed
          }
        } else {
          return; // Missing authentication method
        }

        return {
          grants: client.grants,
          id: client.id,
          scopes: client.scopes,
          redirectUris: client.redirectUris,
          metadata: {
            // Include any additional metadata needed for token generation or verification.
            accessScope: scope,
            nonce,
            userId,
            userEmail: user.email,
            userFullName: user.fullName,
            username: user.username,
          },
        };
      },

      // Validate the refresh token and its association with the client, and return the client, associated user and scope.
      refreshToken: async ({ clientId, refreshToken, scope }) => {
        const refreshTokenData = refreshTokenStorage.get(refreshToken);

        // validate the refresh token and its association with the client
        if (!refreshTokenData) throw createBoomError('invalid_grant', 'Invalid refresh token');

        if (refreshTokenData.clientId !== clientId)
          throw createBoomError('invalid_grant', 'Invalid client for refresh token');

        refreshTokenStorage.delete(refreshToken); // remove the refresh token after use

        if (refreshTokenData.expiresAt < Date.now())
          throw createBoomError('invalid_grant', 'Refresh token has expired');

        const user = AUTH_USERS.find((u) => u.id === refreshTokenData.userId);
        if (!user) return;

        const olderScope = refreshTokenData.scope || [];

        // narrow the scope if the client requests a subset
        const requestedScope = Array.isArray(scope) ? scope : [];
        const accessScope = requestedScope.length
          ? olderScope.filter((s) => requestedScope.includes(s))
          : olderScope;

        return {
          grants: client.grants,
          id: client.id,
          scopes: client.scopes,
          redirectUris: client.redirectUris,
          metadata: {
            // Include any additional metadata needed for token generation or verification.
            accessScope: accessScope,
            userId: refreshTokenData.userId,
            userEmail: user.email,
            userFullName: user.fullName,
            username: user.username,
          },
        };
      },
    })(tokenRequest);
  })
  .generateAccessToken(async (grantContext) => {
    // Generate and return an access token, ID token, scope and refresh token for the authenticated client.
    if (typeof grantContext.client.metadata?.userId != 'string') {
      return;
    }

    const accessScope = Array.isArray(grantContext.client.metadata?.accessScope)
      ? grantContext.client.metadata.accessScope
      : [];

    const registeredClaims = {
      exp: Math.floor(Date.now() / 1000) + grantContext.accessTokenLifetime,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      iss: grantContext.origin,
      aud: grantContext.client.id,
      jti: randomUUID(),
      sub: `${grantContext.client.metadata?.userId}`,
    };

    const { token: accessToken } = await jwksAuthority.sign({
      scope: accessScope.join(' '),
      ...registeredClaims,
    });

    const { token: idToken } = await jwksAuthority.sign({
      username: `${grantContext.client.metadata?.username}`,
      email: accessScope.includes('email')
        ? `${grantContext.client.metadata?.userEmail}`
        : undefined,
      name: accessScope.includes('profile')
        ? `${grantContext.client.metadata?.userFullName}`
        : undefined,
      nonce: grantContext.client.metadata?.nonce
        ? `${grantContext.client.metadata?.nonce}`
        : undefined,
      ...registeredClaims,
    });

    // generate the refresh token if the "offline_access" scope was requested,
    // and store it in the refresh token storage with an expiration time
    const refreshToken = accessScope.includes('offline_access') ? randomUUID() : undefined;

    if (refreshToken) {
      refreshTokenStorage.set(refreshToken, {
        clientId: grantContext.client.id,
        userId: `${grantContext.client.metadata?.userId}`,
        scope: accessScope,
        expiresAt: Date.now() + REFRESH_TOKEN_LIFETIME,
      });
    }

    return {
      accessToken,
      scope: accessScope,
      idToken,
      refreshToken,
    };
  })
  .generateAccessTokenFromRefreshToken(async (grantContext) => {
    // Generate and return a new access token, ID token, scope and
    // refresh token for the authenticated client using a valid refresh token.
    if (typeof grantContext.client.metadata?.userId != 'string') {
      return;
    }
    const accessScope = Array.isArray(grantContext.client.metadata?.accessScope)
      ? grantContext.client.metadata.accessScope
      : [];

    const registeredClaims = {
      exp: Math.floor(Date.now() / 1000) + grantContext.accessTokenLifetime,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      iss: grantContext.origin,
      aud: grantContext.client.id,
      jti: randomUUID(),
      sub: `${grantContext.client.metadata?.userId}`,
    };

    const { token: accessToken } = await jwksAuthority.sign({
      scope: accessScope.join(' '),
      ...registeredClaims,
    });

    const { token: idToken } = await jwksAuthority.sign({
      username: `${grantContext.client.metadata?.username}`,
      email: accessScope.includes('email')
        ? `${grantContext.client.metadata?.userEmail}`
        : undefined,
      ...registeredClaims,
    });

    // rotate: issue a new refresh token to replace the one consumed in getClient
    const refreshToken = accessScope.includes('offline_access') ? randomUUID() : undefined;

    if (refreshToken) {
      refreshTokenStorage.set(refreshToken, {
        clientId: grantContext.client.id,
        userId: `${grantContext.client.metadata?.userId}`,
        scope: accessScope,
        expiresAt: Date.now() + REFRESH_TOKEN_LIFETIME,
      });
    }

    return {
      accessToken,
      scope: accessScope,
      idToken,
      refreshToken,
    };
  })
  .tokenVerifier(async (_c, { token }) => {
    try {
      const payload = await jwksAuthority.verify(token);
      if (payload && typeof payload.scope === 'string') {
        const user = AUTH_USERS.find((u) => u.id === payload.sub);
        if (user) {
          return {
            isValid: true,
            credentials: {
              user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                username: user.username,
              },
              scope: payload.scope.split(' '),
            },
          };
        }
      }
    } catch (error) {
      console.error('Token verification error:', error);
    }
    return { isValid: false };
  })
  .build();

const authDesign = flow.kaapi().toAuthDesign();

const app = new Kaapi({
  // ServerOptions
  port: 3000,
  host: '0.0.0.0',

  // CORS configuration for all routes
  routes: {
    cors: {
      origin: ['*'],
      preflightStatusCode: 204,
    },
  },

  // DocsConfig
  docs: {
    disabled: false,
    path: '/docs',
    title: 'Kaapi OIDC Example API',
    license: {
      name: '',
    },
    version: '0.1.0',

    // explicitly set host external url for production
    // optional if the host defined in ServerOptions is already the external url
    host: {
      url: EXTERNAL_URI,
    },
  },
});

await app.extend([
  // to use the OAuth2 security scheme
  authDesign,
  // to use cookie-based sessions (for the Authorization Code flows in this example)
  {
    async integrate(t) {
      t.server.state(COOKIE_SESSION_NAME, {
        ttl: COOKIE_SESSION_MAX_AGE,
        isHttpOnly: true, // Prevents client-side JS access
        encoding: 'iron', // Automatically serializes objects
        password: COOKIE_PASSWORD,
      });
    },
  },
  // to serve Scalar UI for API docs
  {
    async integrate(t) {
      await t.server.register({
        plugin: hapiScalar,
        options: {
          routePrefix: '/scalar',
          scalarConfig: {
            url: `/docs/schema`,
            theme: 'mars',
            pageTitle: `Kaapi OIDC Example API - Scalar API Explorer`,
            showDeveloperTools: 'never',
            darkMode: false,
          },
        },
      });
    },
  },
]);

// User info endpoint handler
app.route(
  applyModifiers<{
    AuthUser: UserCredentials;
  }>(
    {
      method: 'GET',
      path: flow.getUserInfoEndpoint() || '/userinfo',
      options: {
        description: 'User Info',
        notes:
          "Returns claims about the authenticated user. Requires a valid access token with the 'openid' scope.",
        auth: {
          strategies: [authDesign.getStrategyName()],
          access: {
            entity: 'user',
            scope: ['openid'],
          },
        },
      },
      handler: async (request) => {
        const credentials = request.auth.credentials;
        const user = credentials?.user;
        const scope = credentials?.scope || [];

        if (!user) {
          throw Boom.unauthorized('Unauthorized: missing or invalid access token.');
        }

        return {
          sub: user?.id,
          username: user?.username,
          name: scope.includes('profile') ? user?.fullName : undefined,
          email: scope.includes('email') ? user?.email : undefined,
        };
      },
    },
    {
      responses: new ResponseDocsModifier()
        .setCode(200)
        .setDescription('Successful response with user claims.')
        .addMediaType('application/json', {
          example: {
            sub: 'user123',
            username: 'user',
            name: 'John Doe',
            email: 'user@example.com',
          },
        }),
    }
  )
);

// Protected resource endpoint handler
app.route(
  applyModifiers<{
    AuthUser: UserCredentials;
  }>(
    {
      method: 'GET',
      path: '/protected-resource',
      options: {
        description: 'Protected Resource',
        notes:
          "An example endpoint that requires a valid access token with the 'content:read' scope to access.",
        auth: {
          strategies: [authDesign.getStrategyName()],
          access: {
            entity: 'user',
            scope: ['content:read'],
          },
        },
      },
      handler: async (request) => {
        const credentials = request.auth.credentials;
        const user = credentials?.user;

        if (!user) {
          throw Boom.unauthorized('Unauthorized: missing or invalid access token.');
        }

        return {
          message: `Hello, ${user?.fullName}! You have accessed a protected resource.`,
        };
      },
    },
    {
      responses: groupResponses(
        new ResponseDocsModifier()
          .setCode(200)
          .setDescription('Successful response with protected resource data.')
          .addMediaType('application/json', {
            example: {
              message: 'Hello, John Doe! You have accessed a protected resource.',
            },
          }),
        new ResponseDocsModifier()
          .setCode(401)
          .setDescription('Unauthorized - missing or invalid access token.'),
        new ResponseDocsModifier()
          .setCode(403)
          .setDescription(
            'Forbidden - valid access token but insufficient scope to access the resource.'
          )
      ),
    }
  )
);

// Rotate keys on startup
await jwksRotator.checkAndRotateKeys();

// Schedule regular key rotation checks
setInterval(async () => {
  await jwksRotator.checkAndRotateKeys();
}, 3.6e6); // Check for key rotation every hour

await app.listen();

app.log.info(`Server running at: ${app.base().info.uri}`);
app.log.info(`External URI: ${EXTERNAL_URI}`);
app.log.info(`OpenID Connect discovery endpoint: ${EXTERNAL_URI}${flow.getDiscoveryUrl()}`);
app.log.info(`JWKS endpoint: ${EXTERNAL_URI}${flow.getJwksEndpoint()}`);
app.log.info(`Scalar API Explorer: ${EXTERNAL_URI}/scalar`);
