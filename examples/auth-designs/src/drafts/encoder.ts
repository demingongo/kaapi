
export function encode(payload: object): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decode(str: string): any {
    return JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
}