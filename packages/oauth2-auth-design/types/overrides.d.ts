import {
    JWTPayload
} from 'jose';

declare module '@kaapi/kaapi' {
  interface RequestApplicationState {
    oauth2?: {
      dpopPayload?: JWTPayload;
      dpopThumbprint?: string;
    };
  }
}

export {}
