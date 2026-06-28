import { KaapiOIDCFlow, KaapiOIDCMultipleFlowsBuilder } from "@kaapi/oauth2-auth-design";
import { oidcAuthorizationCodeFlow as authCodeFlow } from "./authorization-code-with-consent";
import { flow as clientCredentialsFlow } from "./client-credentials";
import { EXTERNAL_URI } from "../../config";
import { jwksAuthority } from "../jwks";

const flows: KaapiOIDCFlow[] = [authCodeFlow, clientCredentialsFlow];

export const multipleFlows = KaapiOIDCMultipleFlowsBuilder.create({
  discoveryUrl: "/oidc/v2.0/.well-known/openid-configuration",
  securitySchemeName: "OpenID Connect",
  tokenEndpoint: "/oidc/v2.0/token",
  jwksEndpoint: "/oidc/v2.0/.well-known/jwks.json",
  description: "OpenID Connect implementation with Saurbit OAuth2 library, supporting multiple flows.",
  openidConfiguration: {
    registration_endpoint: "/oidc/v2.0/registration", // activates dynamic client registration endpoint
  },
})
  .onDiscoveryRequest(async (request) => {
    return multipleFlows.kaapi().getDiscoveryConfiguration(request, {
      origin: EXTERNAL_URI, // Use the externally accessible URI for discovery to ensure correct endpoint URLs are provided to clients
    });
  })
  .onJwksRequest(async () => {
    return await jwksAuthority.getJwksEndpointResponse();
  })
  .addFlows(flows)
  .build();
