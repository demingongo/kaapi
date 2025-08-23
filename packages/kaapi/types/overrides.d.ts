import '@hapi/hapi'

declare module '@hapi/hapi' {
  interface PluginSpecificConfiguration {
    kaapi?: {
      docs?: {
        disabled?: boolean;
        story?: string;
      } | false
    };
  }
}

export {}