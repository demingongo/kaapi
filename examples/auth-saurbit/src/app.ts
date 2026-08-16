import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_VERSION,
  DOC_PATH,
  EXTERNAL_URI,
  PORT,
  SERVER_BIND_ADDRESS,
} from './config';
import { multipleFlows } from './security/oidc/multiple-flows';
import Boom from '@hapi/boom';
import { Kaapi } from '@kaapi/kaapi';
import hapiScalar from 'hapi-scalar';

//#region Create and configure Kaapi app

export const app = new Kaapi({
  // ServerOptions
  port: PORT,
  host: SERVER_BIND_ADDRESS,

  // internal logger options
  loggerOptions: {
    level: 'debug',
  },

  // CORS configuration for all routes
  routes: {
    cors: {
      origin: ['*'],
      additionalHeaders: ['Mcp-Session-Id', 'Last-Event-ID', 'Mcp-Protocol-Version'],
      additionalExposedHeaders: ['Mcp-Session-Id'],
      preflightStatusCode: 204,
    },
  },

  // DocsConfig
  docs: {
    disabled: false,
    path: DOC_PATH,
    title: APP_NAME,
    license: {
      name: '',
    },
    version: APP_VERSION,
    ui: {
      swagger: {
        customJsStr: `
                setTimeout(() => {
                if (document.documentElement.classList.contains("dark-mode")) { document.documentElement.classList.remove("dark-mode"); }
                }, 10);
                `,
        customSiteTitle: `${APP_NAME} - API Documentation`,
      },
    },

    // explicitly set host external url for production
    // optional for localhost as it is already defined at Hapi's ServerOptions
    host: {
      url: EXTERNAL_URI,
      description: APP_DESCRIPTION,
      variables: {},
    },

    // (OpenAPI: register some schemas in components section)
    //schemas: [errorSchema],

    // (OpenAPI: register some responses in components section)
    //responses: groupResponses(badRequestResponse),

    // more tags definition
    tags: [],
  },
});

//#endregion

//#region Security on localhost binding

const LOCAL_BIND_ADDRESSES = new Set(['127.0.0.1', 'localhost']);
const isLocalBind = LOCAL_BIND_ADDRESSES.has(SERVER_BIND_ADDRESS);

// DNS rebinding protection — only active when bound to localhost.
// Rejects browser-originated requests whose Origin is not a localhost URL,
// preventing remote websites from reaching a locally-running server via DNS rebinding.
if (isLocalBind) {
  app.base().ext('onPreAuth', (request, h) => {
    const origin = request.headers['origin'];
    // Non-browser clients (curl, MCP clients) do not send an Origin header — allow them.
    // Browser requests must originate from a localhost origin.
    if (typeof origin !== 'undefined') {
      const isLocalOrigin =
        origin === 'null' ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
          Array.isArray(origin) ? origin[0] : origin
        );

      if (!isLocalOrigin) {
        // This immediately stops the request and returns a 403
        throw Boom.forbidden('Forbidden: cross-origin request rejected');
      }
    }
    return h.continue;
  });
}

//#endregion

//#region Extend server with plugins

await app.extend([
  // to use the OAuth2 security scheme
  multipleFlows.kaapi().toAuthDesign(),
  // to use cookie-based sessions (for the Authorization Code flows in this example)
  {
    async integrate(t) {
      t.server.state('session', {
        ttl: 24 * 60 * 60 * 1000, // 1 day lifetime
        isHttpOnly: true, // Prevents client-side JS access
        encoding: 'base64json', // Automatically serializes objects
      });
    },
  },
  // to serve Scalar UI for API docs
  {
    async integrate(t) {
      await t.server.register({
        plugin: hapiScalar,
        options: {
          routePrefix: '/scalar',
          scalarConfig: {
            url: `${DOC_PATH}/schema`,
            theme: 'mars',
            pageTitle: `${APP_NAME} - Scalar API Explorer`,
            showDeveloperTools: 'never',
            darkMode: false,
          },
        },
      });
    },
  },
]);

//#endregion

//#region Set default auth strategy for all routes

app.base().auth.default({
  strategies: [...multipleFlows.getSecuritySchemeNames()],
  mode: 'try',
});

//#endregion
