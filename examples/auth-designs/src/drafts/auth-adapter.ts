/*
import { ReqRef, ReqRefDefaults, Request } from "@kaapi/kaapi";
import { AuthResponseRenderer, OAuth2ACTokenParams, OAuth2ErrorBody } from "@kaapi/oauth2-auth-design";

export type User = {
    id: string;
    name: string
    given_name?: string
    email?: string
    password?: string
    [key: string]: unknown;
}

export type Client = {
    id: string;
    name: string
    secret?: string
    details?: User
    [key: string]: unknown;
}

export type AccessTokenGenerator<P extends object = object, Refs extends ReqRef = ReqRefDefaults, Err extends { error: string } = OAuth2ErrorBody> = (
    params: P,
    req: Request<Refs>
) => Promise<string | Err | null> | string | Err | null

export type AuthCodeAccessTokenGenerator<Refs extends ReqRef = ReqRefDefaults> = AccessTokenGenerator<OAuth2ACTokenParams, Refs>;

export interface AuthAdapter {
    findClientById(id: string): Promise<Client | null>
    findClientByCredentials(id: string, secret: string): Promise<User | null>
    findUserById(id: string): Promise<User | null>
    findUserByCredentials(email: string, password: string): Promise<User | null>
    renderLogin: AuthResponseRenderer
    renderConsent(...): AuthResponseRenderer
    generateAccessToken: AuthCodeAccessTokenGenerator
    generateRefreshToken: AuthCodeAccessTokenGenerator
}

type MyMethodType = <T>(v: number) => T;

interface Example {
    method: MyMethodType;
}

export function createKaapiAuthAdapter(): AuthAdapter {
    return {
        generateAccessToken: <>
            async findClientById(_id: string): Promise<Client | null> {
                return null
            },
        async findClientByCredentials(_id: string, _secret: string): Promise<Client | null> {
            return null
        },
        async findUserById(_id: string): Promise<User | null> {
            return null
        },
        async findUserByCredentials(_email: string, _password: string): Promise<User | null> {
            return null
        },
        async renderLogin(): Promise<Response> {
        },
        async generateAccessToken({ createJwtAccessToken, }): Promise<string> {
            const refreshToken = (scope?.split(' ').includes('offline_access') || undefined) && await createJwtAccessToken({
                sub: user.id,
                client_id: clientId,
                scope,
                exp: Date.now() / 1000 + 604_800, // 7 days

                type: 'refresh'
            })
        }
    }
}




export async function validateJwtUserToken(payload: JWTPayload | undefined) {
    if (payload?.type !== 'user' || !payload.sub) return { isValid: false }

    const user = await db.users.findById(payload.sub)
    if (!user) return { isValid: false }

    return {
        isValid: true,
        credentials: {
            user: {
                sub: user.id,
                name: user.name,
                given_name: user.given_name,
                email: user.email,
                type: 'user'
            }
        }
    }
}
*/