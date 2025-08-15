declare module '@kaapi/kaapi' {
  interface RequestApplicationState {
    oauth2?: {
      proofThumbprint?: string;
    };
  }
}

export {}
