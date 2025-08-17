import {
    ReqRefDefaults,
    Request
} from '@kaapi/kaapi'
import { decodeJwt, JWTPayload, jwtVerify, CryptoKey, KeyObject, JWK } from 'jose'
import { ClientAuthentication } from '@novice1/api-doc-generator';

export type TokenEndpointAuthMethod = 'client_secret_basic' | 'client_secret_post' | 'client_secret_jwt' | 'private_key_jwt' | 'none'

export type OAuth2ClientAuthentication = ClientAuthentication | TokenEndpointAuthMethod

export type ClientAuthMethodResponse = {
    /**
     * if the authentication method is in the request
     */
    hasAuthMethod: boolean;
    clientId?: string;
    clientSecret?: string
}

export interface ClientAuthMethod {
    readonly method: TokenEndpointAuthMethod

    readonly secretIsOptional: boolean

    readonly algorithms?: string[]

    /**
     * Extract clientId and clientSecret from the request
     */
    extractParams(request: Request<ReqRefDefaults>): Promise<ClientAuthMethodResponse> | ClientAuthMethodResponse
}

export class ClientSecretBasic implements ClientAuthMethod {

    get method(): 'client_secret_basic' {
        return 'client_secret_basic'
    }

    get secretIsOptional(): boolean {
        return false
    }

    extractParams(request: Request<ReqRefDefaults>): ClientAuthMethodResponse {

        const res: ClientAuthMethodResponse = {
            hasAuthMethod: false
        }

        const authorization = request.raw.req.headers.authorization;

        const [authType, base64Credentials] = authorization ? authorization.split(/\s+/) : ['', ''];

        if (authType.toLowerCase() == 'basic') {
            res.hasAuthMethod = true
            const decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8').split(':');
            if (!decoded[0] || !decoded[1]) {
                //
            } else {
                res.clientId = decoded[0];
                res.clientSecret = decoded[1];
            }
        }

        return res;
    }
}

export class ClientSecretPost implements ClientAuthMethod {

    get method(): 'client_secret_post' {
        return 'client_secret_post'
    }

    get secretIsOptional(): boolean {
        return false
    }

    extractParams(req: Request<ReqRefDefaults>): ClientAuthMethodResponse {

        const res: ClientAuthMethodResponse = {
            hasAuthMethod: false
        }

        if (req.payload && typeof req.payload === 'object' &&
            'client_id' in req.payload &&
            'client_secret' in req.payload
        ) {
            res.hasAuthMethod = true
            if (typeof req.payload.client_id === 'string')
                res.clientId = req.payload.client_id
            if (typeof req.payload.client_secret === 'string')
                res.clientSecret = req.payload.client_secret
        }

        return res;
    }
}

export class NoneAuthMethod implements ClientAuthMethod {

    get method(): 'none' {
        return 'none'
    }

    get secretIsOptional(): boolean {
        return true
    }

    extractParams(req: Request<ReqRefDefaults>): ClientAuthMethodResponse {

        const res: ClientAuthMethodResponse = {
            hasAuthMethod: false
        }

        if (req.payload && typeof req.payload === 'object' &&
            'client_id' in req.payload
        ) {
            res.hasAuthMethod = true
            if (typeof req.payload.client_id === 'string')
                res.clientId = req.payload.client_id
        }

        return res;
    }
}

export enum ClientSecretJwtAlgorithms {
    HS256 = 'HS256',
    HS384 = 'HS384',
    HS512 = 'HS512'
}

export class ClientSecretJwt implements ClientAuthMethod {

    static algo = ClientSecretJwtAlgorithms

    get method(): 'client_secret_jwt' {
        return 'client_secret_jwt'
    }

    get secretIsOptional(): boolean {
        return false
    }

    get algorithms(): ClientSecretJwtAlgorithms[] {
        return this.#algorithms.length ? this.#algorithms : [ClientSecretJwtAlgorithms.HS256]
    }

    #algorithms: ClientSecretJwtAlgorithms[] = []

    #handler: (clientId: string, decoded: JWTPayload, clientAssertion: string) => Promise<Uint8Array | string | null>

    constructor() {
        this.#handler = async () => null
    }

    addAlgo(algo: ClientSecretJwtAlgorithms): this {
        if (!this.#algorithms.includes(algo)) {
            this.#algorithms.push(algo)
            this.#algorithms.sort()
        }
        return this
    }

    getClientSecret(handler: (clientId: string, decoded: JWTPayload, clientAssertion: string) => Promise<Uint8Array | string | null>): this {
        this.#handler = handler
        return this
    }

    async extractParams(req: Request<ReqRefDefaults>): Promise<ClientAuthMethodResponse> {

        const res: ClientAuthMethodResponse = {
            hasAuthMethod: false
        }

        if (req.payload &&
            typeof req.payload === 'object' &&
            'client_assertion_type' in req.payload &&
            req.payload.client_assertion_type == 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' &&
            'client_assertion' in req.payload &&
            typeof req.payload.client_assertion === 'string'
        ) {
            res.hasAuthMethod = true

            const decoded = decodeJwt(req.payload.client_assertion)

            if (decoded.aud && typeof decoded.aud === 'string') {
                res.clientId = decoded.aud
                const clientSecret = await this.#handler(
                    decoded.aud,
                    decoded,
                    req.payload.client_assertion
                );

                if (clientSecret) {
                    const { payload } = await jwtVerify(
                        req.payload.client_assertion,
                        typeof clientSecret === 'string' ? new TextEncoder().encode(clientSecret) : clientSecret,
                        {
                            algorithms: this.algorithms
                        }
                    )
                    if (payload) {
                        res.clientSecret = typeof clientSecret === 'string' ? clientSecret : new TextDecoder().decode(clientSecret)
                    }
                }
            }
        }

        return res;
    }
}

export enum PrivateKeyJwtAlgorithms {
    RS256 = 'RS256',
    RS384 = 'RS384',
    RS512 = 'RS512',
    PS256 = 'PS256',
    PS384 = 'PS384',
    PS512 = 'PS512',
    ES256 = 'ES256',
    ES384 = 'ES384',
    ES512 = 'ES512',
    EdDSA = 'EdDSA'
}

export class PrivateKeyJwt implements ClientAuthMethod {

    static algo = PrivateKeyJwtAlgorithms

    get method(): 'private_key_jwt' {
        return 'private_key_jwt'
    }

    get secretIsOptional(): boolean {
        return false
    }

    get algorithms(): PrivateKeyJwtAlgorithms[] {
        return this.#algorithms.length ? this.#algorithms : [PrivateKeyJwtAlgorithms.RS256]
    }

    #algorithms: PrivateKeyJwtAlgorithms[] = []

    #handler: (clientId: string, decoded: JWTPayload, clientAssertion: string) => Promise<CryptoKey | KeyObject | JWK | Uint8Array | string | null>

    constructor() {
        this.#handler = async () => null
    }

    addAlgo(algo: PrivateKeyJwtAlgorithms): this {
        if (!this.#algorithms.includes(algo)) {
            this.#algorithms.push(algo)
            this.#algorithms.sort()
        }
        return this
    }

    getPublicKeyForClient(handler: (clientId: string, decoded: JWTPayload, clientAssertion: string) => Promise<CryptoKey | KeyObject | JWK | Uint8Array | string | null>): this {
        this.#handler = handler
        return this
    }

    async extractParams(req: Request<ReqRefDefaults>): Promise<ClientAuthMethodResponse> {

        const res: ClientAuthMethodResponse = {
            hasAuthMethod: false
        }

        if (req.payload &&
            typeof req.payload === 'object' &&
            'client_assertion_type' in req.payload &&
            req.payload.client_assertion_type == 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' &&
            'client_assertion' in req.payload &&
            typeof req.payload.client_assertion === 'string'
        ) {
            const decoded = decodeJwt(req.payload.client_assertion)

            if (decoded.aud && typeof decoded.aud === 'string') {
                res.clientId = decoded.aud
                const publicKey = await this.#handler(
                    decoded.aud,
                    decoded,
                    req.payload.client_assertion
                );

                if (publicKey) {
                    const { payload } = await jwtVerify(
                        req.payload.client_assertion,
                        typeof publicKey === 'string' ? new TextEncoder().encode(publicKey) : publicKey,
                        {
                            algorithms: this.algorithms
                        }
                    )
                    if (payload) {
                        res.clientSecret = req.payload.client_assertion
                    }
                }
            }
        }

        return res;
    }
}