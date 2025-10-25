import { OpenAPI, Postman, ProcessedRoute } from '@novice1/api-doc-generator';
import { OpenAPIJoiHelper } from '@novice1/api-doc-generator/lib/generators/openapi/helpers/joiHelper';
import { KaapiServerRoute } from '@kaapi/server';
import { type RouteMeta } from '@novice1/routing';
import { ReqRef, ReqRefDefaults, RequestRoute } from '@hapi/hapi';
import { JoiSchema } from '@novice1/api-doc-generator/lib/helpers/joiHelper';

class CustomHelper extends OpenAPIJoiHelper {
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

function formatRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[] | KaapiServerRoute<Refs>): RouteMeta[] {

    let sRoutes: KaapiServerRoute<Refs>[] = [];

    if (Array.isArray(serverRoutes)) {
        sRoutes = serverRoutes
    } else {
        sRoutes = [serverRoutes]
    }

    const routes: RouteMeta[] = []

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

                    let files: Record<string, JoiSchema> | undefined = undefined
                    if (sRoute.options?.payload && typeof sRoute.options?.validate?.payload === 'object') {
                        const helper = new CustomHelper({ value: sRoute.options.validate.payload })
                        if (helper.isValid() && helper.getType() === 'object') {
                            files = helper.getFilesChildren()
                            if (files && !Object.keys(files).length) {
                                files = undefined
                            }
                        }
                    }

                    route.parameters = sRoute.options?.validate ? { ...sRoute.options?.validate, body: sRoute.options?.validate.payload, files: files } : undefined
                    if (route.parameters && sRoute.options?.payload?.allow) {
                        route.parameters.consumes = Array.isArray(sRoute.options.payload.allow) ? sRoute.options.payload.allow : [sRoute.options.payload.allow];
                    }
                    if (route.parameters && typeof sRoute.options?.plugins?.kaapi?.docs === 'object') {
                        if (sRoute.options.plugins.kaapi.docs.story) {
                            route.parameters.story = sRoute.options.plugins.kaapi?.docs.story
                        }
                    }
                }

                return route;
            }
        )

        routes.push(...formattedRoutes)
    })

    return routes
}

function formatRequestRoute<Refs extends ReqRef = ReqRefDefaults>(reqRoute: RequestRoute<Refs>): RouteMeta[] {

    const sRoute: RequestRoute<Refs> = reqRoute;

    const routes: RouteMeta[] = []

    // only string paths
    if (typeof sRoute.path != 'string') return routes

    if (!sRoute.path) return routes

    const path = sRoute.path

    // require methods
    if (!sRoute.method) return routes

    if (sRoute.settings &&
        typeof sRoute.settings === 'object' &&
        (sRoute.settings.plugins?.kaapi?.docs === false || sRoute.settings.plugins?.kaapi?.docs?.disabled)) {
        return routes
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

                let files: Record<string, JoiSchema> | undefined = undefined
                if (sRoute.settings?.payload && typeof sRoute.settings?.validate?.payload === 'object') {
                    const helper = new CustomHelper({ value: sRoute.settings.validate.payload })
                    if (helper.isValid() && helper.getType() === 'object') {
                        files = helper.getFilesChildren()
                        if (files && !Object.keys(files).length) {
                            files = undefined
                        }
                    }
                }

                route.parameters = sRoute.settings?.validate ? { ...sRoute.settings?.validate, body: sRoute.settings?.validate.payload, files: files } : undefined
                if (route.parameters && sRoute.settings?.payload?.allow) {
                    route.parameters.consumes = Array.isArray(sRoute.settings.payload.allow) ? sRoute.settings.payload.allow : [sRoute.settings.payload.allow];
                }
                if (route.parameters && typeof sRoute.settings.plugins?.kaapi?.docs === 'object') {
                    if (sRoute.settings.plugins.kaapi.docs.story) {
                        route.parameters.story = sRoute.settings.plugins.kaapi.docs.story
                    }
                }
            }

            return route;
        }
    )

    routes.push(...formattedRoutes)


    return routes
}

export interface KaapiDocGenerator {
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoute: KaapiServerRoute<Refs>): ProcessedRoute[];
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[]): ProcessedRoute[];
    addRequestRoute<Refs extends ReqRef = ReqRefDefaults>(serverRoute: RequestRoute<Refs>): ProcessedRoute[];
}

export class KaapiOpenAPI extends OpenAPI implements KaapiDocGenerator {
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[] | KaapiServerRoute<Refs>): ProcessedRoute[] {
        return super.add(formatRoutes(serverRoutes))
    }

    addRequestRoute<Refs extends ReqRef = ReqRefDefaults>(reqRoute: RequestRoute<Refs>): ProcessedRoute[] {
        return super.add(formatRequestRoute(reqRoute))
    }
}

export class KaapiPostman extends Postman implements KaapiDocGenerator {
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[] | KaapiServerRoute<Refs>): ProcessedRoute[] {
        return super.add(formatRoutes(serverRoutes))
    }

    addRequestRoute<Refs extends ReqRef = ReqRefDefaults>(reqRoute: RequestRoute<Refs>): ProcessedRoute[] {
        return super.add(formatRequestRoute(reqRoute))
    }
}