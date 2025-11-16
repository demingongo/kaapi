import {
    ReqRef,
    ReqRefDefaults,
    Request
} from '@kaapi/kaapi'
import {
    jwtVerify,
    importJWK,
    calculateJwkThumbprint
} from 'jose';
import { InMemoryReplayStore, ReplayDetector } from './replay-store';

export type TokenTypeValidationResponse = {
    isValid?: boolean | undefined
    message?: string | undefined
}

export type TokenTypeValidation<
    Refs extends ReqRef = ReqRefDefaults
> = (req: Request<Refs>, token: string, ttl: number) => TokenTypeValidationResponse | Promise<TokenTypeValidationResponse>

export type TokenRequestValidation<
    Refs extends ReqRef = ReqRefDefaults
> = (req: Request<Refs>, ttl: number) => TokenTypeValidationResponse | Promise<TokenTypeValidationResponse>

export interface TokenType<
    Refs extends ReqRef = ReqRefDefaults
> {
    readonly prefix: string
    /**
     * 401 if not valid
     */
    isValid: (req: Request<Refs>, token: string) => TokenTypeValidationResponse | Promise<TokenTypeValidationResponse>

    isValidTokenRequest?: (req: Request<Refs>) => TokenTypeValidationResponse | Promise<TokenTypeValidationResponse>
}

export interface IBearerToken<
    Refs extends ReqRef = ReqRefDefaults
> extends TokenType<Refs> {
    readonly prefix: 'Bearer'
}

export interface IDPoPToken<
    Refs extends ReqRef = ReqRefDefaults
> extends TokenType<Refs> {
    readonly prefix: 'DPoP'
}

export class BearerToken<
    Refs extends ReqRef = ReqRefDefaults
> implements IBearerToken<Refs> {
    #ttl: number = 300
    #_handler: TokenTypeValidation<Refs>

    get prefix(): 'Bearer' {
        return 'Bearer'
    }

    get configuration() {
        return {}
    }

    constructor() {
        this.#_handler = async (_, token) => {
            if (!token) return {}

            return { isValid: true }
        }
    }

    validate(handler: TokenTypeValidation<Refs>): this {
        this.#_handler = handler
        return this
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async isValid(req: Request<any>, token: string): Promise<TokenTypeValidationResponse> {
        return await this.#_handler(req, token, this.#ttl)
    }
}

export class DPoPToken<
    Refs extends ReqRef = ReqRefDefaults
> implements IDPoPToken<Refs> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #handler: TokenTypeValidation<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #tokenRequestHandler: TokenRequestValidation<any>
    #ttl: number = 300
    #replayDetector: ReplayDetector = new InMemoryReplayStore<string>()

    get prefix(): 'DPoP' {
        return 'DPoP'
    }

    get configuration() {
        return {
            dpop_signing_alg_values_supported: ['ES256'],
            require_dpop: true
        }
    }

    constructor() {
        this.#handler = async (req: Request<ReqRefDefaults>, token, ttl) => {
            if (!token) return {}
            return await this._handleDefault(req, ttl)
        }

        this.#tokenRequestHandler = async (req: Request<ReqRefDefaults>, ttl) => {
            return await this._handleDefault(req, ttl)
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async _handleDefault(req: Request<any>, ttl: number): Promise<TokenTypeValidationResponse> {
        const dpopHeader = req.raw.req.headers.dpop;
        if (!dpopHeader || typeof dpopHeader != 'string') return { message: 'Missing Demonstration of Proof-of-Possession' }

        try {
            const { payload, protectedHeader } = await jwtVerify(dpopHeader, async (header) => {
                if (!header.jwk) throw new Error('Missing JWK');
                return importJWK(header.jwk, header.alg);
            }, { algorithms: ['ES256'] });

            if (payload.htm !== req.method.toUpperCase()) throw new Error('HTM mismatch');

            const forwardedProto = req.headers['x-forwarded-proto'];
            const protocol = forwardedProto ? forwardedProto : req.server.info.protocol;
            const fullUrl = protocol
                + '://'
                + req.info.host
                + req.path;
            if (payload.htu !== fullUrl) throw new Error('HTU mismatch');

            const now = Math.floor(Date.now() / 1000);

            if (!payload.iat) throw new Error('Missing IAT');
            if (Math.abs(now - payload.iat) > ttl) throw new Error('Proof expired');

            if (!payload.jti) throw new Error('Missing JTI');

            if (await this.#replayDetector.has(payload.jti)) throw new Error('Replay detected');
            await this.#replayDetector.add(payload.jti, ttl);

            req.app.oauth2 = req.app.oauth2 || {}
            req.app.oauth2.dpopPayload = payload;

            // Optional: bind proof to access token
            if (protectedHeader.jwk) {
                // const tokenThumbprint = ... extract from token cnf.jkt
                const dpopThumbprint = await calculateJwkThumbprint(protectedHeader.jwk, 'sha256');
                req.app.oauth2.dpopThumbprint = dpopThumbprint
                // if (tokenThumbprint !== proofThumbprint) throw new Error('Token binding mismatch');
            }

            return { isValid: true }
        } catch (err) {
            console.error('Invalid DPoP proof:', err)
            return { message: `${err}` }
        }
    }

    setReplayDetector(value: ReplayDetector): this {
        this.#replayDetector = value
        return this
    }

    /**
     * time to live in seconds
     */
    setTTL(seconds: number): this {
        this.#ttl = seconds
        return this
    }

    validateTokenRequest(handler: TokenRequestValidation<Refs>): this {
        this.#tokenRequestHandler = handler
        return this
    }

    validate(handler: TokenTypeValidation<Refs>): this {
        this.#handler = handler
        return this
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async isValidTokenRequest(req: Request<any>): Promise<TokenTypeValidationResponse> {
        return await this.#tokenRequestHandler(req, this.#ttl)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async isValid(req: Request<any>, token: string): Promise<TokenTypeValidationResponse> {
        return await this.#handler(req, token, this.#ttl)
    }
}
