import { HandlerDecorations, InternalRouteOptionType, Lifecycle, MergeType, ReqRef, ReqRefDefaults, RouteOptionTypes, Server, ServerAuthScheme } from '@hapi/hapi';
import { ILogger } from './log';
import { KaapiServerRoute } from '@kaapi/server';
import { KaapiOpenAPI, KaapiPostman } from './docs/generators';


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

export interface KaapiPlugin {
    integrate(t: KaapiTools): void | Promise<void>
}
