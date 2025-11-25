import { HandlerDecorations, InternalRouteOptionType, Lifecycle, MergeType, ReqRef, ReqRefDefaults, RouteOptionTypes, Server, ServerAuthScheme } from '@hapi/hapi';
import { ILogger } from '../log';
import { KaapiServerRoute } from '@kaapi/server';
import { KaapiOpenAPI, KaapiPostman } from '../docs/generators';
import { BaseAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils';
import { OAuth2Util } from '@novice1/api-doc-generator';
import { KaapiGroupAuthUtil } from '../docs/utils';

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
 * await app.extend(plugin)
 * // or
 * await app.extend([plugin1, plugin2])
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
            this.integrateStrategy(t);
            t.log.debug(`Auth Design "${this.constructor.name}" set strategy (integrateStrategy).`);
        } catch (err) {
            t.log.error(`Auth Design "${this.constructor.name}" failed to integrate auth strategy: ${err}`);
            throw err;
        }

        const securityScheme = this.docs();
        if (securityScheme) {
            if (securityScheme instanceof OAuth2Util && !securityScheme.getHost() && t.postman?.getHost().length) {
                securityScheme.setHost(t.postman.getHostValue())
            }
            t.openapi?.addSecurityScheme(securityScheme)
                .setDefaultSecurity(securityScheme);
            t.postman?.setDefaultSecurity(securityScheme);
            t.log.debug(`Auth Design "${this.constructor.name}" set security scheme (docs).`);
        } else {
            t.log.warn(`Auth Design "${this.constructor.name}" did not provide a security scheme (docs()).`);
        }

        await this.integrateHook(t)
    }

    /**
     * Whatever needs to be done to complete the integration.
     * (e.g.: register a route, ...)
     */
    integrateHook(_t: KaapiTools): void | Promise<void> {

    }

    /**
     * Returns the schema used for the documentation
     */
    abstract docs(): BaseAuthUtil | undefined

    /**
     * Where authentication schemes and strategies should be registered.
     */
    abstract integrateStrategy(t: KaapiTools): void

    /**
     * The name of the strategy, for info purpose
     */
    abstract getStrategyName(): string | string[]
}

/**
 * An auth design that groups multiple auth designs.
 * 
 * Usefull to regroup the auth schemes in the documentation and register the strategies in parallel.
 * ```ts
 * const authdesigns = new GroupAuthDesign([
 *     authdesign1,
 *     authdesign2
 * ])
 * app.extend(authdesigns)
 * ```
 */
export class GroupAuthDesign extends AuthDesign {

    protected designs: AuthDesign[]

    constructor(designs: AuthDesign[]) {
        super();
        this.designs = designs;
    }

    docs() {
        return new KaapiGroupAuthUtil(this.designs
            .map(d => d.docs())
            .filter(d => typeof d != 'undefined')
        )
    }
    integrateStrategy(t: KaapiTools) {
        for (const d of this.designs) {
            d.integrateStrategy(t)
        }
    }
    async integrateHook(t: KaapiTools): Promise<void> {
        await Promise.all(
            this.designs
                .map(d => d.integrateHook(t))
        )
    }

    getStrategyName(): string {
        return this.getStrategies()[0] || ''
    }

    getStrategies(): string[] {
        return this.designs.map(d => {
            const str = d.getStrategyName()
            if (!Array.isArray(str)) {
                return [str]
            }
            return str
        }).flat().filter(n => n)
    }
}