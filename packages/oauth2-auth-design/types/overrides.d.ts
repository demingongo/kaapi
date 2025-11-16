import {
  JWTPayload
} from 'jose';

declare module '@kaapi/kaapi' {
  interface RequestApplicationState {
    oauth2?: {
      dpopPayload?: JWTPayload | undefined;
      dpopThumbprint?: string | undefined;
    } | undefined;
  }
}

export { }
