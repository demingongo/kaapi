import { BearerTokenType, ClientSecretBasic, ClientSecretPost } from '@saurbit/oauth2';
import db from './database';
import {
    KaapiOIDCClientCredentialsFlowBuilder,
} from '@kaapi/oauth2-auth-design';
import { jwksAuthority } from '../plugins/jwks';

export default KaapiOIDCClientCredentialsFlowBuilder.create({
    jwksEndpoint: '/.well-known/jwks.json',
    tokenEndpoint: '/oauth2/token',
})
    .setTokenType(new BearerTokenType()) // optional, default BearerToken
    .setAccessTokenLifetime(600) // 10m
    .addClientAuthenticationMethod(new ClientSecretBasic()) // client authentication methods
    .addClientAuthenticationMethod(new ClientSecretPost()) // client authentication methods
    .tokenVerifier(async (_, { token }) => {
        try {
            const payload = await jwksAuthority.verify(token);
            if (payload && payload.type === "machine" && payload.machine) {
                const user = await db.users.findById(`${payload.machine}`);
                if (user) {
                    return {
                        isValid: true,
                        credentials: {
                            app: {
                                machine: user.id,
                                name: user.name,
                                type: 'machine',
                            },
                        },
                    };
                }
            }
        } catch (error) {
            console.error(
                {
                    error: error instanceof Error ? { name: error.name, message: error.message } : error,
                },
                "Token verification error:"
            );
        }
        return { isValid: false };
    })
    .getClient(async (tokenRequest) => {
        // db query + secret validation
        const client = await db.clients.findByCredentials(tokenRequest.clientId, tokenRequest.clientSecret);
        if (!client) {
            return undefined;
        }
        return {
            id: client.id,
            grants: ["client_credentials"],
            scopes: ["read:data", "write:data", "delete:data", "read:config", "write:config", "read:logs", "write:logs", "execute:tasks", "manage:tokens", "admin:all"],
            redirectUris: [],
            metadata: client.details
        };
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
            machine: grantContext.client.metadata?.id,
            name: grantContext.client.metadata?.name,
            type: 'machine',
            ...registeredClaims,
        });
        return { accessToken };
    })
    .setDescription(
        'Client credentials grant flow. [More info](https://www.oauth.com/oauth2-servers/access-tokens/client-credentials/)'
    )
    .setScopes({
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
    })
    .build();
