import { HandlerDecorations, InternalRouteOptionType, Lifecycle, MergeType, ReqRef, ReqRefDefaults, RouteOptionTypes, Server, ServerAuthScheme } from '@hapi/hapi';
import { ILogger } from './log';
import { KaapiServerRoute } from '@kaapi/server';
import { KaapiOpenAPI, KaapiPostman } from './docs/generators';
import { BaseAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils';
import { OAuth2Util } from '@novice1/api-doc-generator';

/**
 * 
 * Set of tools
 * 
 * ```ts
 * log
 * openapi
 * postman
 * server
 * route(...)
 * scheme(...)
 * strategy(...)
 * ```
 */
export interface KaapiTools {
    readonly log: ILogger;
    route<Refs extends ReqRef = ReqRefDefaults>(serverRoute: KaapiServerRoute<Refs>, handler?: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>): this;
    openapi?: KaapiOpenAPI;
    postman?: KaapiPostman;

    scheme<
        Refs extends ReqRef = ReqRefDefaults,
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        Options extends object = {}
    >(name: string, scheme: ServerAuthScheme<Options, Refs>): void;
    strategy(
        name: MergeType<InternalRouteOptionType, RouteOptionTypes>['Strategy'],
        scheme: string,
        options?: object
    ): void;

    server: Server
}

/**
 * Interface to extend kaapi app functionalities.
 * ```ts
 * const app = new Kaapi({
 *   extend: [plugin]
 * })
 * // or
 * app.extend(plugin)
 * // or
 * app.extend([plugin1, plugin2])
 * ```
 */
export interface KaapiPlugin {
    integrate(t: KaapiTools): void | Promise<void>
}

/**
 * AuthDesign plugin
 */
export abstract class AuthDesign implements KaapiPlugin {
    async integrate(t: KaapiTools): Promise<void> {

        try {
            await this.integrateStrategy(t);
        } catch (err) {
            t.log.error(`Plugin "${this.constructor.name}" failed to integrate auth strategy: ${err}`);
            throw err;
        }

        const securityScheme = this.docs();
        if (securityScheme) {
            t.openapi?.addSecurityScheme(securityScheme)
                .setDefaultSecurity(securityScheme);
            if (securityScheme instanceof OAuth2Util && !securityScheme.getHost() && t.postman?.getHost().length) {
                securityScheme.setHost(t.postman.getHost()[0])
            }
            t.postman?.setDefaultSecurity(securityScheme);
        } else {
            t.log.warn(`Plugin "${this.constructor.name}" did not provide a security scheme (docs()).`);
        }

        await this.integrateHook(t)
    }

    /**
     * Whatever needs to be done to complete the integration.
     * (e.g.: register a route, ...)
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    integrateHook(_t: KaapiTools): void | Promise<void> {
        
    }

    /**
     * Returns the schema used for the documentation
     */
    abstract docs(): BaseAuthUtil | undefined

    /**
     * Where authentication schemes and strategies should be registered.
     */
    abstract integrateStrategy(t: KaapiTools): void | Promise<void>
}