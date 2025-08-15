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
import { InMemoryTmpCache } from './in-memory-cache';

export type TokenTypeValidationResponse = {
    isValid?: boolean
    message?: string
}

export type TokenTypeValidation<
    Refs extends ReqRef = ReqRefDefaults
> = (req: Request<Refs>, token: string, ttl: number, host?: string) => TokenTypeValidationResponse | Promise<TokenTypeValidationResponse>

export interface TokenType<
    Refs extends ReqRef = ReqRefDefaults
> {
    readonly prefix: string
    /**
     * 401 if not valid
     */
    isValid: (req: Request<Refs>, token: string, host?: string) => TokenTypeValidationResponse | Promise<TokenTypeValidationResponse>
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
    readonly ttl?: number
}

export class DPoPToken<
    Refs extends ReqRef = ReqRefDefaults
> implements IDPoPToken<Refs> {
    #ttl: number = 300
    #_handler: TokenTypeValidation<Refs>
    #cache = new InMemoryTmpCache<string>()

    get prefix(): 'DPoP' {
        return 'DPoP'
    }

    constructor() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.#_handler = async (req: Request<any>, token, ttl, host) => {
            if (!token) return {}

            const dpopHeader = req.raw.req.headers.dpop;
            if (!dpopHeader || typeof dpopHeader != 'string') return {}

            try {
                const { payload, protectedHeader } = await jwtVerify(dpopHeader, async (header) => {
                    if (!header.jwk) throw new Error('Missing JWK');
                    return importJWK(header.jwk, header.alg);
                }, { algorithms: ['ES256'] });

                if (payload.htm !== req.method.toUpperCase()) throw new Error('HTM mismatch');
                const fullUrl = `${host || ''}${req.path}`;
                if (payload.htu !== fullUrl) throw new Error('HTU mismatch');

                const now = Math.floor(Date.now() / 1000);

                if (!payload.iat) throw new Error('Missing IAT');
                if (Math.abs(now - payload.iat) > ttl) throw new Error('Proof expired');

                if (!payload.jti) throw new Error('Missing JTI');
                if (await this.#cache.has(payload.jti)) throw new Error('Replay detected');
                this.#cache.set(payload.jti, ttl);

                // Optional: bind proof to access token
                
                if (protectedHeader.jwk) {
                    // const tokenThumbprint = ... extract from token cnf.jkt
                    const proofThumbprint = await calculateJwkThumbprint(protectedHeader.jwk, 'sha256');
                    req.proofThumbprint = proofThumbprint
                    // if (tokenThumbprint !== proofThumbprint) throw new Error('Token binding mismatch');
                }
                //req.dpopProof = payload;

                return { isValid: true }
            } catch (err) {
                console.error('Invalid DPoP proof:', err)
                return { message: `${err}` }
            }
        }
    }

    setTTL(value: number): this {
        this.#ttl = value
        return this
    }

    async isValid(req: Request<Refs>, token: string, host?: string): Promise<TokenTypeValidationResponse> {
        return await this.#_handler(req, token, this.#ttl, host)
    }
}