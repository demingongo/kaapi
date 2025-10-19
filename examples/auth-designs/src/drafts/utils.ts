import { randomBytes } from 'crypto'


export const VERIFICATION_URI = 'http://localhost:3000/oauth2/v2/activate'

export function generateCode(size: number) {
    return randomBytes(size).toString('hex')
}