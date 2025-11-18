import { ContextAuthUtil, GroupContextAuthUtil, OpenAPI, OpenAPIHelperClass, OpenAPIHelperInterface, OpenAPIOptions, OpenAPIResult, Postman, PostmanHelperClass, PostmanOptions, ProcessedRoute } from '@novice1/api-doc-generator';
import { OpenAPIJoiHelper } from '@novice1/api-doc-generator/lib/generators/openapi/helpers/joiHelper';
import { KaapiServerRoute } from '@kaapi/server';
import { type RouteMeta } from '@novice1/routing';
import { AccessSetting, ReqRef, ReqRefDefaults, RequestRoute, RouteOptionsAccessObject, RouteOptionsAccessScope, RouteOptionsValidate, ServerAuthConfig } from '@hapi/hapi';
import { JoiSchema } from '@novice1/api-doc-generator/lib/helpers/joiHelper';
import { OpenAPIMixHelper, PostmanMixHelper } from './api-doc-mix-helpers';
import { deepExtend } from './deep-extend';
import { BaseAuthUtil, BaseOpenAPIAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils';
import { ReferenceObject, SecuritySchemeObject } from '@novice1/api-doc-generator/lib/generators/openapi/definitions';

// declared in overrides.d.ts
export interface KaapiOpenAPIHelperInterface extends OpenAPIHelperInterface {
    isFile(): boolean | undefined;
    getFilesChildren(): Record<string, unknown>;
}

// declared in overrides.d.ts
export type KaapiOpenAPIHelperClass = {
    new(args: {
        isRoot?: boolean;
        value: unknown;
    }): KaapiOpenAPIHelperInterface;
};

class CustomHelper extends OpenAPIJoiHelper implements KaapiOpenAPIHelperInterface {
    isFile() {
        return this._joi['$_terms']
            && Array.isArray(this._joi['$_terms'].tags)
            && this._joi['$_terms'].tags.includes('files')
    }

    getRawSchema() {
        return this._joi
    }

    getFilesChildren(): Record<string, JoiSchema> {
        const r: Record<string, JoiSchema> = {};
        if (!this.isJoi()) {
            return r;
        }
        if (this._joi.$_terms
            && this._joi.$_terms.keys && this._joi.$_terms.keys.length) {
            this._joi.$_terms.keys.forEach(
                (c: { key: string, schema?: Record<string, JoiSchema> }) => {
                    const ch = new CustomHelper({ value: c.schema })
                    if (ch.isValid() && ch.isFile())
                        r[c.key] = ch.getRawSchema()
                });
        }
        return r;
    }
}

export type OpenApiSchemaExtension = { path: string, method: string; definition: object }

export function formatRoutes<Refs extends ReqRef = ReqRefDefaults>(
    serverRoutes: KaapiServerRoute<Refs>[] | KaapiServerRoute<Refs>,
    securitySchemes?: Map<string, BaseAuthUtil>,
    authConfigDefault?: ServerAuthConfig
): { routes: RouteMeta[], extensions?: OpenApiSchemaExtension[] } {

    let sRoutes: KaapiServerRoute<Refs>[] = [];

    if (Array.isArray(serverRoutes)) {
        sRoutes = serverRoutes
    } else {
        sRoutes = [serverRoutes]
    }

    const routes: RouteMeta[] = []
    const extensions: OpenApiSchemaExtension[] = []

    sRoutes.forEach(sRoute => {
        // only string paths
        if (typeof sRoute.path != 'string') return

        if (!sRoute.path) return

        const path = sRoute.path

        // require methods
        if (!sRoute.method) return

        if (sRoute.options &&
            typeof sRoute.options === 'object' &&
            (sRoute.options.plugins?.kaapi?.docs === false || sRoute.options.plugins?.kaapi?.docs?.disabled)) {
            return
        }

        let methods: string[] = []
        if (Array.isArray(sRoute.method)) {
            methods = sRoute.method
        } else {
            methods = [sRoute.method]
        }

        const formattedRoutes: RouteMeta[] = methods.map(
            method => {
                const route: RouteMeta = {
                    methods: {
                        [method.toLowerCase()]: true
                    },
                    path: path,
                    auth: sRoute.auth || (
                        sRoute.options && typeof sRoute.options === 'object' &&
                        sRoute.options.auth && typeof sRoute.options.auth === 'object' && !!sRoute.options.auth.mode
                    ) || false,
                    //responses: sRoute.responses
                };

                if (typeof sRoute.options != 'function') {
                    route.tags = sRoute.options?.tags
                    route.description = sRoute.options?.description
                    route.name = route.description

                    const pluginKaapiDocs = typeof sRoute.options?.plugins?.kaapi?.docs === 'object' ? sRoute.options.plugins.kaapi.docs : {}
                    const schemaProp = pluginKaapiDocs.helperSchemaProperty
                    const routeOptionsValidate: RouteOptionsValidate | undefined = schemaProp && sRoute.options?.plugins && schemaProp in sRoute.options.plugins ?
                        (sRoute.options.plugins[schemaProp] as RouteOptionsValidate | undefined) :
                        sRoute.options?.validate

                    let files: Record<string, unknown> | undefined = undefined
                    if (sRoute.options?.payload && (
                        typeof routeOptionsValidate?.payload === 'object' || typeof routeOptionsValidate?.payload === 'function'
                    )) {
                        const helperClass = (pluginKaapiDocs.openAPIHelperClass) ?
                            pluginKaapiDocs.openAPIHelperClass :
                            CustomHelper;
                        const helper = new helperClass({ value: routeOptionsValidate.payload })
                        if (helper.isValid() && helper.getType() === 'object') {
                            files = helper.getFilesChildren()
                            if (files && !Object.keys(files).length) {
                                files = undefined
                            }
                        }
                    }

                    route.parameters = routeOptionsValidate ? { ...routeOptionsValidate, body: routeOptionsValidate.payload, files: files } : {}
                    if (sRoute.options?.notes) {
                        route.parameters.descriptionType = 'text/markdown'
                        if (Array.isArray(sRoute.options.notes)) {
                            route.parameters.story = sRoute.options.notes.join('\n\n')
                        } else {
                            route.parameters.story = sRoute.options.notes
                        }
                    }
                    if (sRoute.options?.payload?.allow) {
                        route.parameters.consumes = Array.isArray(sRoute.options.payload.allow) ? sRoute.options.payload.allow : [sRoute.options.payload.allow];
                    }
                    if (pluginKaapiDocs.openApiSchemaExtension) {
                        extensions.push({
                            path: path,
                            method: method.toLowerCase(),
                            definition: pluginKaapiDocs.openApiSchemaExtension
                        })
                    }
                    // route security
                    if (sRoute.options?.auth && typeof sRoute.options.auth === 'object' && securitySchemes) {
                        let strategies: string[] = sRoute.options.auth.strategy ?
                            [sRoute.options.auth.strategy] :
                            (sRoute.options.auth.strategies?.length ? sRoute.options.auth.strategies : []);

                        if (!strategies.length && authConfigDefault) {
                            strategies = authConfigDefault.strategy ?
                                [authConfigDefault.strategy] :
                                (authConfigDefault.strategies?.length ? authConfigDefault.strategies : []);
                        }

                        if (strategies.length && securitySchemes) {
                            const schemes = strategies
                                .filter(s => securitySchemes.has(s))
                                .map(s => securitySchemes.get(s)!);
                            if (schemes.length) {
                                let hapiScopes: RouteOptionsAccessScope = sRoute.options.auth.scope ||
                                    (sRoute.options.auth.access && 'scope' in sRoute.options.auth.access ? sRoute.options.auth.access.scope : false);
                                if (!hapiScopes) {
                                    const accessSettings: RouteOptionsAccessObject[] = sRoute.options.auth.access ?
                                        (Array.isArray(sRoute.options.auth.access) ? sRoute.options.auth.access : [sRoute.options.auth.access]) : [];
                                    if (accessSettings.length === 1) {
                                        const accessObject = accessSettings[0]
                                        if ('scope' in accessObject) {
                                            hapiScopes = accessObject.scope
                                        }
                                    }
                                }
                                const routeScopes = typeof hapiScopes === 'string' ?
                                    [hapiScopes] :
                                    (Array.isArray(hapiScopes) ? hapiScopes : undefined);
                                const security = new GroupContextAuthUtil(
                                    schemes.map(v => routeScopes?.length ? new ContextAuthUtil(v, routeScopes) : v)
                                );
                                route.parameters.security = security
                            }
                        }
                    }
                }

                return route;
            }
        )

        routes.push(...formattedRoutes)
    })

    return { routes, extensions }
}

export function formatRequestRoute<Refs extends ReqRef = ReqRefDefaults>(
    reqRoute: RequestRoute<Refs>,
    securitySchemes?: Map<string, BaseAuthUtil>,
    authConfigDefault?: ServerAuthConfig
): { routes: RouteMeta[], extensions?: OpenApiSchemaExtension[] } {

    const sRoute: RequestRoute<Refs> = reqRoute;

    const routes: RouteMeta[] = []
    const extensions: OpenApiSchemaExtension[] = []

    // only string paths
    if (typeof sRoute.path != 'string') return { routes }

    if (!sRoute.path) return { routes }

    const path = sRoute.path

    // require methods
    if (!sRoute.method) return { routes }

    if (sRoute.settings &&
        typeof sRoute.settings === 'object' &&
        (sRoute.settings.plugins?.kaapi?.docs === false || sRoute.settings.plugins?.kaapi?.docs?.disabled)) {
        return { routes }
    }


    let methods: string[] = []
    if (Array.isArray(sRoute.method)) {
        methods = sRoute.method
    } else {
        methods = [sRoute.method]
    }

    const formattedRoutes: RouteMeta[] = methods.map(
        method => {
            const route: RouteMeta = {
                methods: {
                    [method.toLowerCase()]: true
                },
                path: path,
                auth: !!sRoute.settings.auth?.mode,
                //responses: sRoute.responses
            };

            if (typeof sRoute.settings != 'function') {
                route.tags = sRoute.settings?.tags
                route.description = sRoute.settings?.description
                route.name = route.description

                const pluginKaapiDocs = typeof sRoute.settings?.plugins?.kaapi?.docs === 'object' ? sRoute.settings.plugins.kaapi.docs : {}
                const schemaProp = pluginKaapiDocs.helperSchemaProperty
                const routeOptionsValidate: RouteOptionsValidate | undefined = schemaProp && sRoute.settings?.plugins && schemaProp in sRoute.settings.plugins ?
                    (sRoute.settings.plugins[schemaProp] as RouteOptionsValidate | undefined) :
                    sRoute.settings?.validate

                let files: Record<string, unknown> | undefined = undefined
                if (sRoute.settings?.payload && (
                    typeof routeOptionsValidate?.payload === 'object' || typeof routeOptionsValidate?.payload === 'function'
                )) {
                    const helperClass = (pluginKaapiDocs.openAPIHelperClass) ?
                        pluginKaapiDocs.openAPIHelperClass :
                        CustomHelper;
                    const helper = new helperClass({ value: routeOptionsValidate.payload })
                    if (helper.isValid() && helper.getType() === 'object') {
                        files = helper.getFilesChildren()
                        if (files && !Object.keys(files).length) {
                            files = undefined
                        }
                    }
                }

                route.parameters = routeOptionsValidate ? { ...routeOptionsValidate, body: routeOptionsValidate.payload, files: files } : {}
                if (sRoute.settings?.notes) {
                    route.parameters.descriptionType = 'text/markdown'
                    if (Array.isArray(sRoute.settings.notes)) {
                        route.parameters.story = sRoute.settings.notes.join('\n\n')
                    } else {
                        route.parameters.story = sRoute.settings.notes
                    }
                }
                if (route.parameters && sRoute.settings?.payload?.allow) {
                    route.parameters.consumes = Array.isArray(sRoute.settings.payload.allow) ? sRoute.settings.payload.allow : [sRoute.settings.payload.allow];
                }
                if (pluginKaapiDocs.openApiSchemaExtension) {
                    extensions.push({
                        path: path,
                        method: method.toLowerCase(),
                        definition: pluginKaapiDocs.openApiSchemaExtension
                    })
                }
                // route security
                if (sRoute.settings?.auth && typeof sRoute.settings.auth === 'object' && securitySchemes) {
                    let strategies: string[] = sRoute.settings.auth.strategies;

                    if (!strategies.length && authConfigDefault) {
                        strategies = authConfigDefault.strategy ?
                            [authConfigDefault.strategy] :
                            (authConfigDefault.strategies?.length ? authConfigDefault.strategies : []);
                    }

                    if (strategies.length && securitySchemes) {
                        const schemes = strategies
                            .filter(s => securitySchemes.has(s))
                            .map(s => securitySchemes.get(s)!);
                        if (schemes.length) {
                            let routeScopes: string[] | undefined = []
                            const accessSettings: AccessSetting[] = sRoute.settings.auth.access || [];
                            if (accessSettings.length === 1) {
                                if (typeof accessSettings[0].scope === 'object') {
                                    routeScopes = accessSettings[0].scope.selection
                                }
                            }
                            const security = new GroupContextAuthUtil(
                                schemes.map(v => routeScopes?.length ? new ContextAuthUtil(v, routeScopes) : v)
                            );
                            route.parameters.security = security
                        }
                    }
                }
            }

            return route;
        }
    )

    routes.push(...formattedRoutes)


    return { routes, extensions }
}

export interface KaapiDocGenerator {
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoute: KaapiServerRoute<Refs>): ProcessedRoute[];
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[]): ProcessedRoute[];
    addRequestRoute<Refs extends ReqRef = ReqRefDefaults>(serverRoute: RequestRoute<Refs>): ProcessedRoute[];
}

export class KaapiOpenAPI extends OpenAPI implements KaapiDocGenerator {

    protected routeExtensions: object = {}

    /**
     * Used when formatting routes (security by route).
     * 
     * Useful for Postman collection. 
     * As Postman is more of a testing tool than specs definition, it seems logical to keep it here
     * (Postman generator does not have "addSecurityScheme" like method).
     */
    protected securitySchemeUtils: Record<string, BaseAuthUtil> = {}

    constructor(options?: OpenAPIOptions) {
        if (options?.helperClass) {
            OpenAPIMixHelper.helperClasses.add(options.helperClass)
        }
        super({ ...options, helperClass: OpenAPIMixHelper });
    }

    /**
     * @override
     */
    addSecurityScheme(
        name: BaseOpenAPIAuthUtil | BaseAuthUtil | string,
        schema?: ReferenceObject | SecuritySchemeObject
    ): this {
        if (typeof name === 'string') {
            if (schema)
                super.addSecurityScheme(name, schema)
        } else {
            super.addSecurityScheme(name)
            if (name instanceof BaseAuthUtil) {
                // keep it to use when formatting routes (security by route)
                // mostly useful for Postman but as Postman cannot contain all specs
                // we keep it here
                this.securitySchemeUtils[Object.keys(name.toOpenAPI())[0]] = name;
            }
        }
        return this
    }

    /**
     * @override
     */
    removeAll(): ProcessedRoute[] {
        this.routeExtensions = {}
        return super.removeAll()
    }

    /**
     * @override
     */
    result(): OpenAPIResult {
        let result = super.result()
        if (Object.keys(this.routeExtensions).length) {
            result = deepExtend({}, result)
            result = deepExtend(result, { paths: this.routeExtensions })
        }
        return result
    }

    extendRoute(path: string, method: string, definition: object) {
        this.routeExtensions = deepExtend(this.routeExtensions, {
            [path]: {
                [method.toLowerCase()]: definition
            }
        })
    }

    addCustom(routes: RouteMeta[], extensions?: OpenApiSchemaExtension[]): ProcessedRoute[] {
        if (extensions) {
            for (const o of extensions) {
                this.extendRoute(o.path, o.method, o.definition)
            }
        }
        return super.add(routes)
    }

    getSecuritySchemeUtils(): Map<string, BaseAuthUtil> {
        return new Map<string, BaseAuthUtil>(Object.entries(this.securitySchemeUtils))
    }

    getSecuritySchemeUtil(name: string): BaseAuthUtil | undefined {
        return this.securitySchemeUtils[name]
    }

    addHelperClass(helperClass: OpenAPIHelperClass) {
        OpenAPIMixHelper.helperClasses.add(helperClass)
    }

    removeHelperClass(helperClass: OpenAPIHelperClass) {
        OpenAPIMixHelper.helperClasses.delete(helperClass)
    }

    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[] | KaapiServerRoute<Refs>): ProcessedRoute[] {
        const { routes } = formatRoutes(serverRoutes, this.getSecuritySchemeUtils())
        return super.add(routes)
    }

    addRequestRoute<Refs extends ReqRef = ReqRefDefaults>(reqRoute: RequestRoute<Refs>): ProcessedRoute[] {
        const { routes } = formatRequestRoute(reqRoute, this.getSecuritySchemeUtils())
        return super.add(routes)
    }
}

export class KaapiPostman extends Postman implements KaapiDocGenerator {

    constructor(options?: PostmanOptions) {
        if (options?.helperClass) {
            PostmanMixHelper.helperClasses.add(options.helperClass)
        }
        super({ ...options, helperClass: PostmanMixHelper });
    }

    addHelperClass(helperClass: PostmanHelperClass) {
        PostmanMixHelper.helperClasses.add(helperClass)
    }

    removeHelperClass(helperClass: PostmanHelperClass) {
        PostmanMixHelper.helperClasses.delete(helperClass)
    }

    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[] | KaapiServerRoute<Refs>): ProcessedRoute[] {
        const { routes } = formatRoutes(serverRoutes)
        return super.add(routes)
    }

    addRequestRoute<Refs extends ReqRef = ReqRefDefaults>(reqRoute: RequestRoute<Refs>): ProcessedRoute[] {
        const { routes } = formatRequestRoute(reqRoute)
        return super.add(routes)
    }
}