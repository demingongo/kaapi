import db from './database';
import {
    KaapiOIDCClientCredentialsFlow,
    KaapiOIDCClientCredentialsFlowBuilder
} from '@kaapi/oauth2-auth-design';
import {
    BearerTokenType,
    ClientSecretBasic,
    ClientSecretPost
} from "@saurbit/oauth2"
import { jwksAuthority } from "./jwks";

const ALLOWED_SCOPES = {
    'read:data': 'Allows the client to retrieve or query data from the service.',
    'write:data': 'Allows the client to create or update data in the service.',
    'delete:data': 'Allows the client to remove data from the service.',
    'read:config': 'Allows the client to access configuration or metadata settings.',
    'write:config': 'Allows the client to modify configuration or metadata settings.',
    'read:logs': 'Allows the client to retrieve logs or audit trails from the service.',
    'write:logs': 'Allows the client to send or store logs into the system.',
    'execute:tasks': 'Allows the client to trigger or run predefined tasks or jobs.',
    'manage:tokens': 'Allows the client to manage access or refresh tokens for automation.',
    'admin:all': 'Grants full administrative access to all available resources and operations.',
}

const flow: KaapiOIDCClientCredentialsFlow = KaapiOIDCClientCredentialsFlowBuilder.create()
    .setTokenType(new BearerTokenType()) // optional, default BearerToken
    .setAccessTokenLifetime(600) // 10m
    .addClientAuthenticationMethod(new ClientSecretBasic()) // client authentication methods
    .addClientAuthenticationMethod(new ClientSecretPost()) // client authentication methods
    .setJwksEndpoint('/.well-known/jwks.json')
    .tokenVerifier(async (_, { token }) => {
        const jwtAccessTokenPayload = await jwksAuthority.verify(token);

        // db query
        const user =
            jwtAccessTokenPayload?.type === 'machine' && jwtAccessTokenPayload?.machine
                ? await db.users.findById(`${jwtAccessTokenPayload.machine}`)
                : undefined;

        // not found
        if (!user) {
            return { isValid: false };
        }

        // authorized
        return {
            isValid: true,
            credentials: {
                user: {
                    machine: user.id,
                    name: user.name,
                    type: 'machine',
                },
            },
        };
    })
    .getClient(async (requestInfo) => {
        const client = await db.clients.findByCredentials(requestInfo.clientId, requestInfo.clientSecret);
        // client found
        if (client) {
            return {
                id: client.id,
                grants: ['client_credentials'],
                redirectUris: [],
                scopes: Object.keys(ALLOWED_SCOPES),
                metadata: {
                    name: client.name,
                    details: client.details
                }
            }
        }
        return;
    })
    .generateAccessToken(async (grantContext) => {
        const registeredClaims = {
            exp: Math.floor(Date.now() / 1000) + grantContext.accessTokenLifetime,
            iat: Math.floor(Date.now() / 1000),
            nbf: Math.floor(Date.now() / 1000),
            iss: grantContext.origin,
            aud: grantContext.client.id,
            jti: crypto.randomUUID(),
            sub: grantContext.client.id,
        };

        const { token: accessToken } = await jwksAuthority.sign({
            scope: grantContext.scope.join(" "),
            type: 'machine',
            ...registeredClaims,
        });
        return { accessToken };
    })
    .setDescription(
        'Client credentials grant flow. [More info](https://www.oauth.com/oauth2-servers/access-tokens/client-credentials/)'
    )
    .setScopes(ALLOWED_SCOPES)
    .setOnDiscoveryRequest(async (request) => {
        return flow.kaapi().getDiscoveryConfiguration(request, {});
    })
    .setOnJwksRequest(async () => {
        return await jwksAuthority.getJwksEndpointResponse();
    })
    .build();

export default flow;