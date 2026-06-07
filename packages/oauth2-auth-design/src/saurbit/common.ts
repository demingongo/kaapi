import { AuthDesign, KaapiTools } from "@kaapi/kaapi";
import type { OAuth2AuthDesignOptions } from "./types";
import type { BaseAuthUtil } from "@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils";

/**
 * Concrete {@link AuthDesign} implementation for the OAuth 2.0 flow.
 *
 * Delegates all `AuthDesign` contract methods to the {@link OAuth2AuthDesignOptions}
 * provided at construction time.
 */
export class OAuth2AuthDesign extends AuthDesign {
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
    integrateHook(t: KaapiTools): void | Promise<void> {
        return this.#options.integrateHook ? this.#options.integrateHook(t) : undefined;
    }
}