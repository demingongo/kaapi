import { AuthDesign, KaapiTools } from "@kaapi/kaapi";
import type { IMultipleOAuth2AuthDesign, IOAuth2AuthDesign, MultipleOAuth2AuthDesignOptions, OAuth2AuthDesignOptions } from "./types";
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

export class MultipleOAuth2AuthDesign extends AuthDesign implements IMultipleOAuth2AuthDesign {
    #options: MultipleOAuth2AuthDesignOptions;

    /** @param options - Delegate implementation for each `AuthDesign` method. */
    constructor(options: MultipleOAuth2AuthDesignOptions) {
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

export class OIDCAuthUtil extends OAuth2Util {

    protected discoveryUrl?: string;

    setDiscoveryUrl(url: string): this {
        this.discoveryUrl = url;
        return this;
    }

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