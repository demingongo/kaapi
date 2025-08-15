// types/hapi.d.ts
import '@hapi/hapi';

declare module '@hapi/hapi' {
  interface Request {
    proofThumbprint?: string;
  }
}

export {}
