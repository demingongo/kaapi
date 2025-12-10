import { ContextAuthUtil, GroupContextAuthUtil, OpenAPI, OpenAPIHelperClass, OpenAPIHelperInterface, OpenAPIOptions, OpenAPIResult, Postman, PostmanCollection, PostmanHelperClass, PostmanOptions, ProcessedRoute } from '@novice1/api-doc-generator';
import { OpenAPIJoiHelper } from '@novice1/api-doc-generator/lib/generators/openapi/helpers/joiHelper';
import { KaapiServerRoute } from '@kaapi/server';
import { type RouteMeta } from '@novice1/routing';
import { AccessSetting, ReqRef, ReqRefDefaults, RequestRoute, RouteOptionsAccessObject, RouteOptionsAccessScope, RouteOptionsValidate, ServerAuthConfig } from '@hapi/hapi';
import { JoiSchema } from '@novice1/api-doc-generator/lib/helpers/joiHelper';
import { OpenAPIMixHelper, PostmanMixHelper } from './api-doc-mix-helpers';
import { deepExtend } from './deep-extend';
import { BaseAuthUtil, BaseOpenAPIAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils';
import { ReferenceObject, SecuritySchemeObject } from '@novice1/api-doc-generator/lib/generators/openapi/definitions';
import { PostmanRequestBodyModel, RequestBodyDocsModifier, ResponseDocsModifier } from './modifiers';
import { BaseResponseUtil } from '@novice1/api-doc-generator/lib/utils/responses/baseResponseUtils';

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

export type RouteModifier = {
    path: string;
    method: string;
    definition: object;
    name?: string | undefined;
    tags?: string[] | undefined;
}

export function formatRoutes<Refs extends ReqRef = ReqRefDefaults>(
    serverRoutes: KaapiServerRoute<Refs>[] | KaapiServerRoute<Refs>,
    securitySchemes?: Map<string, BaseAuthUtil>,
    authConfigDefault?: ServerAuthConfig
): { routes: RouteMeta[], modifiers?: RouteModifier[] } {

    let sRoutes: KaapiServerRoute<Refs>[] = [];

    if (Array.isArray(serverRoutes)) {
        sRoutes = serverRoutes
    } else {
        sRoutes = [serverRoutes]
    }

    const routes: RouteMeta[] = []
    const modifiers: RouteModifier[] = []

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
                    let docsModifiers: {
                        requestBody?: RequestBodyDocsModifier | undefined;
                        responses?: BaseResponseUtil;
                    } | undefined = undefined;
                    if (typeof pluginKaapiDocs.modifiers === 'function') {
                        docsModifiers = pluginKaapiDocs.modifiers()
                    }
                    if (docsModifiers?.requestBody) {
                        if (docsModifiers.requestBody instanceof RequestBodyDocsModifier) {
                            modifiers.push({
                                path: path,
                                method: method.toLowerCase(),
                                definition: docsModifiers.requestBody,
                                name: route.name,
                                tags: route.tags
                            })
                        } else {
                            throw TypeError(`Expected instance of RequestBodyDocsModifier (at ${method} ${path})`)
                        }
                    }
                    if (docsModifiers?.responses) {
                        if (docsModifiers.responses instanceof BaseResponseUtil) {
                            modifiers.push({
                                path: path,
                                method: method.toLowerCase(),
                                definition: docsModifiers.responses,
                                name: route.name,
                                tags: route.tags
                            })
                        } else {
                            throw TypeError(`Expected instance of BaseResponseUtil (at ${method} ${path})`)
                        }
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

    return { routes, modifiers }
}

export function formatRequestRoute<Refs extends ReqRef = ReqRefDefaults>(
    reqRoute: RequestRoute<Refs>,
    securitySchemes?: Map<string, BaseAuthUtil>,
    authConfigDefault?: ServerAuthConfig
): { routes: RouteMeta[], modifiers?: RouteModifier[] } {

    const sRoute: RequestRoute<Refs> = reqRoute;

    const routes: RouteMeta[] = []
    const modifiers: RouteModifier[] = []

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
                let docsModifiers: {
                    requestBody?: RequestBodyDocsModifier | undefined;
                    responses?: BaseResponseUtil;
                } | undefined = undefined;
                if (typeof pluginKaapiDocs.modifiers === 'function') {
                    docsModifiers = pluginKaapiDocs.modifiers()
                }
                if (docsModifiers?.requestBody) {
                    if (docsModifiers.requestBody instanceof RequestBodyDocsModifier) {
                        modifiers.push({
                            path: path,
                            method: method.toLowerCase(),
                            definition: docsModifiers.requestBody,
                            name: route.name,
                            tags: route.tags
                        })
                    } else {
                        throw TypeError(`Expected instance of RequestBodyDocsModifier (at ${method} ${path})`)
                    }
                }
                if (docsModifiers?.responses) {
                    if (docsModifiers.responses instanceof BaseResponseUtil) {
                        modifiers.push({
                            path: path,
                            method: method.toLowerCase(),
                            definition: docsModifiers.responses,
                            name: route.name,
                            tags: route.tags
                        })
                    } else {
                        throw TypeError(`Expected instance of BaseResponseUtil (at ${method} ${path})`)
                    }
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


    return { routes, modifiers }
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
            this.addSecuritySchemeAliases(name)
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

    /**
     * 
     * throws error if alias already exists
     */
    addSecuritySchemeAliases(
        helper: BaseOpenAPIAuthUtil | BaseAuthUtil,
        aliases?: string[]
    ): this {
        super.addSecurityScheme(helper)
        if (helper instanceof BaseAuthUtil) {
            // keep it to use when formatting routes (security by route)
            // mostly useful for Postman but as Postman cannot contain all specs
            // we keep it here
            const name = Object.keys(helper.toOpenAPI())[0];
            this.securitySchemeUtils[name] = helper;
            if (aliases?.length) {
                for (const alias of aliases) {
                    if (alias != name) {
                        if (this.securitySchemeUtils[alias]) {
                            throw new Error(`Security support alias "${alias}" already exists. Please choose a unique alias.`);
                        }
                        this.securitySchemeUtils[alias] = helper;
                    }
                }
            }
        }
        return this
    }

    modifyRoute(path: string, method: string, definition: object) {
        if (definition instanceof ResponseDocsModifier) {
            this.routeExtensions = deepExtend(this.routeExtensions, {
                [path]: {
                    [method.toLowerCase()]: {
                        responses: definition.toOpenAPIRefPreferred()
                    }
                }
            })
        } else if (definition instanceof BaseResponseUtil) {
            this.routeExtensions = deepExtend(this.routeExtensions, {
                [path]: {
                    [method.toLowerCase()]: {
                        responses: definition.toOpenAPI()
                    }
                }
            })
        } else if (definition instanceof RequestBodyDocsModifier) {
            this.routeExtensions = deepExtend(this.routeExtensions, {
                [path]: {
                    [method.toLowerCase()]: {
                        requestBody: definition.toOpenAPI()
                    }
                }
            })
        } else {
            this.routeExtensions = deepExtend(this.routeExtensions, {
                [path]: {
                    [method.toLowerCase()]: definition
                }
            })
        }
    }

    addCustom(routes: RouteMeta[], modifiers?: RouteModifier[]): ProcessedRoute[] {
        if (modifiers) {
            for (const o of modifiers) {
                this.modifyRoute(o.path, o.method, o.definition)
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

type ExtensionsByMethod = Record<string, {
    name?: string | undefined;
    definition: PostmanRequestBodyModel;
}>
type ExtensionsByPath = Record<string, ExtensionsByMethod>

export class KaapiPostman extends Postman implements KaapiDocGenerator {

    protected routeExtensions: {
        tagged: Record<string, ExtensionsByPath>;
        notTagged: ExtensionsByPath;
    } = {
            tagged: {},
            notTagged: {}
        }

    constructor(options?: PostmanOptions) {
        if (options?.helperClass) {
            PostmanMixHelper.helperClasses.add(options.helperClass)
        }
        super({ ...options, helperClass: PostmanMixHelper });
    }

    /**
     * @override
     */
    removeAll(): ProcessedRoute[] {
        this.routeExtensions = {
            tagged: {},
            notTagged: {}
        }
        return super.removeAll()
    }

    /**
     * @override
     */
    result(): PostmanCollection {
        let result = super.result()
        if (Object.keys(this.routeExtensions.tagged).length || Object.keys(this.routeExtensions.notTagged).length) {
            result = deepExtend({}, result)
        }
        if (Object.keys(this.routeExtensions.tagged).length) {
            for (const tag in this.routeExtensions.tagged) {
                const folder = result.item.find(f => f.name === tag)
                if (tag === folder?.name) {
                    if ('item' in folder) {
                        const extByPath = this.routeExtensions.tagged[tag]
                        itemLoop: for (const item of folder.item) {
                            if ('request' in item &&
                                item.request.url?.path &&
                                item.request.method
                            ) {
                                const requestPath = (typeof item.request.url?.path === 'string' ?
                                    item.request.url?.path : item.request.url?.path?.join('/'));
                                if (requestPath) {
                                    const extByMethod = extByPath[`/${requestPath}`];
                                    if (extByMethod && extByMethod[item.request.method]) {
                                        const def = extByMethod[item.request.method];
                                        if (def.name && def.name != item.name) {
                                            continue itemLoop;
                                        }
                                        if (def.definition.header.length) {
                                            item.request.header = item.request.header || [];
                                            if (Array.isArray(item.request.header)) {
                                                const mergedMap = new Map();

                                                // Add all source items first
                                                item.request.header.forEach(item => mergedMap.set(item.key, item));

                                                // Merge with updates
                                                def.definition.header.forEach(item => {
                                                    if (mergedMap.has(item.key)) {
                                                        // Merge properties: source + update (update overrides conflicts)
                                                        mergedMap.set(item.key, { ...mergedMap.get(item.key), ...item });
                                                    } else {
                                                        mergedMap.set(item.key, item);
                                                    }
                                                });

                                                item.request.header = Array.from(mergedMap.values());
                                            } else {
                                                // is a string
                                            }
                                        }
                                        item.request.body = deepExtend(item.request.body || {}, def.definition.body)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if (Object.keys(this.routeExtensions.notTagged).length) {
            const extByPath = this.routeExtensions.notTagged
            itemLoop: for (const item of result.item) {
                if ('request' in item &&
                    item.request.url?.path &&
                    item.request.method
                ) {
                    const requestPath = (typeof item.request.url?.path === 'string' ?
                        item.request.url?.path : item.request.url?.path?.join('/'));
                    if (requestPath) {
                        const extByMethod = extByPath[`/${requestPath}`];
                        if (extByMethod && extByMethod[item.request.method]) {
                            const def = extByMethod[item.request.method];
                            if (def.name && def.name != item.name) {
                                continue itemLoop;
                            }
                            if (def.definition.header.length) {
                                item.request.header = item.request.header || [];
                                if (Array.isArray(item.request.header)) {
                                    const mergedMap = new Map();

                                    // Add all source items first
                                    item.request.header.forEach(item => mergedMap.set(item.key, item));

                                    // Merge with updates
                                    def.definition.header.forEach(item => {
                                        if (mergedMap.has(item.key)) {
                                            // Merge properties: source + update (update overrides conflicts)
                                            mergedMap.set(item.key, { ...mergedMap.get(item.key), ...item });
                                        } else {
                                            mergedMap.set(item.key, item);
                                        }
                                    });

                                    item.request.header = Array.from(mergedMap.values());
                                } else {
                                    // is a string
                                }
                            }
                            item.request.body = deepExtend(item.request.body || {}, def.definition.body)
                        }
                    }
                }
            }
        }
        return result
    }

    modifyRoute(path: string, method: string, definition: RequestBodyDocsModifier, name?: string, tags?: string[] | undefined) {
        if (name && definition instanceof RequestBodyDocsModifier) {
            const v: ExtensionsByPath = {
                [path.replace(/{([^}]+)}/g, ':$1').replace(/\*/g, '')]: {
                    [method.toUpperCase()]: {
                        name,
                        definition: definition.toPostman()
                    }
                }
            }
            if (tags?.length) {
                for (const tag of tags) {
                    this.routeExtensions.tagged[tag] = deepExtend(this.routeExtensions.tagged[tag], v)
                }
            } else {
                this.routeExtensions.notTagged = deepExtend(this.routeExtensions.notTagged, v)
            }
        }
    }

    addCustom(routes: RouteMeta[], modifiers?: RouteModifier[]): ProcessedRoute[] {
        if (modifiers) {
            for (const o of modifiers) {
                if (o.name && o.definition instanceof RequestBodyDocsModifier)
                    this.modifyRoute(o.path, o.method, o.definition, o.name, o.tags)
            }
        }
        return super.add(routes)
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

    /**
     * Gets the first host value (getHost()[0] replacing placeholders with values).
     */
    getHostValue(): string {
        let host: string | undefined = this.getHost()[0];
        if (!host) return ''
        const variables = this.getVariableList()
        if (variables?.length) {
            host = host.replace(/{{(.*?)}}/g, (_, key) => {
                const variable = variables.find(v => v.key === key.trim());
                return variable ? `${variable.value}` : `{{${key}}}`; // keep placeholder if not found
            })
        }
        return host
    }
}