import { AuthDesign, KaapiTools } from "@kaapi/kaapi";
import type { IOAuth2MultipleFlowsAuthDesign, IOAuth2AuthDesign, OAuth2MultipleFlowsAuthDesignOptions, OAuth2AuthDesignOptions } from "./types";
import type { BaseAuthUtil } from "@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils";
import { OAuth2Util, SecuritySchemeObject } from "@novice1/api-doc-generator";

/**
 * Concrete {@link AuthDesign} implementation for the OAuth 2.0 flow.
 *
 * Delegates all `AuthDesign` contract methods to the {@link OAuth2AuthDesignOptions}
 * provided at construction time.
 */
export class OAuth2AuthDesign extends AuthDesign implements IOAuth2AuthDesign {
    #options: OAuth2AuthDesignOptions;

    /** @param options - Delegate implementation for each `AuthDesign` method. */
    constructor(options: OAuth2AuthDesignOptions) {
        super();
        this.#options = options;
    }
    /** @inheritdoc */
    docs(): BaseAuthUtil {
        return this.#options.docs();
    }
    /** @inheritdoc */
    integrateStrategy(t: KaapiTools): void {
        return this.#options.integrateStrategy(t);
    }
    /** @inheritdoc */
    getStrategyName(): string {
        return this.#options.getStrategyName();
    }

    /** @inheritdoc */
    integrateHook(t: KaapiTools, skipCommonRoutes?: boolean): void | Promise<void> {
        return this.#options.integrateHook ? this.#options.integrateHook(t, skipCommonRoutes) : undefined;
    }
}

/**
 * Concrete {@link AuthDesign} implementation for multiple concurrent OAuth 2.0 flows.
 *
 * Delegates all `AuthDesign` contract methods to the {@link OAuth2MultipleFlowsAuthDesignOptions}
 * provided at construction time. Used when an authorization server supports more than one
 * grant type simultaneously.
 */
export class OAuth2MultipleFlowsAuthDesign extends AuthDesign implements IOAuth2MultipleFlowsAuthDesign {
    #options: OAuth2MultipleFlowsAuthDesignOptions;

    /** @param options - Delegate implementation for each `AuthDesign` method. */
    constructor(options: OAuth2MultipleFlowsAuthDesignOptions) {
        super();
        this.#options = options;
    }
    /** @inheritdoc */
    docs(): BaseAuthUtil {
        return this.#options.docs();
    }
    /** @inheritdoc */
    integrateStrategy(t: KaapiTools): void {
        return this.#options.integrateStrategy(t);
    }
    /** @inheritdoc */
    getStrategyName(): string[] {
        return this.#options.getStrategyName();
    }

    /** @inheritdoc */
    integrateHook(t: KaapiTools, skipCommonRoutes?: boolean): void | Promise<void> {
        return this.#options.integrateHook ? this.#options.integrateHook(t, skipCommonRoutes) : undefined;
    }
}

/**
 * OpenAPI documentation utility for OpenID Connect flows.
 *
 * Extends {@link OAuth2Util} to produce an `openIdConnect` security scheme entry
 * in the OpenAPI specification, using the discovery document URL instead of
 * individual endpoint URLs.
 */
export class OIDCAuthUtil extends OAuth2Util {

    protected discoveryUrl?: string;

    /**
     * Sets the URL of the OpenID Connect discovery document.
     *
     * @param url - Absolute or relative URL of the OIDC discovery endpoint
     *   (e.g. `"/.well-known/openid-configuration"`).
     * @returns `this` for chaining.
     */
    setDiscoveryUrl(url: string): this {
        this.discoveryUrl = url;
        return this;
    }

    /**
     * Serialises this scheme to an OpenAPI `SecuritySchemeObject` map.
     *
     * Produces a single `openIdConnect` entry whose `openIdConnectUrl` is
     * built from the configured host and discovery URL.
     *
     * @returns A record mapping the security scheme name to its OpenAPI definition.
     */
    toOpenAPI(): Record<string, SecuritySchemeObject> {
        const host = this.getHost();
        return {
            [this.securitySchemeName]: {
                type: 'openIdConnect',
                openIdConnectUrl: `${host || ''}${this.discoveryUrl || '/.well-known/openid-configuration'}`,
            },
        };
    }
}