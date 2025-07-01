import { OpenAPI, Postman, ProcessedRoute } from '@novice1/api-doc-generator';
import { OpenAPIJoiHelper } from '@novice1/api-doc-generator/lib/generators/openapi/helpers/joiHelper';
import { KaapiServerRoute } from '@kaapi/server';
import { RouteMeta } from '@novice1/routing';
import { ReqRef, ReqRefDefaults } from '@hapi/hapi';
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
                    auth: sRoute.auth || false,
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
                }

                return route;
            }
        )

        routes.push(...formattedRoutes)
    })

    return routes
}

export interface KaapiDocGenerator {
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoute: KaapiServerRoute<Refs>): ProcessedRoute[];
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[]): ProcessedRoute[];
}

export class KaapiOpenAPI extends OpenAPI implements KaapiDocGenerator {
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[] | KaapiServerRoute<Refs>): ProcessedRoute[] {
        return super.add(formatRoutes(serverRoutes))
    }
}

export class KaapiPostman extends Postman implements KaapiDocGenerator {
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[] | KaapiServerRoute<Refs>): ProcessedRoute[] {
        return super.add(formatRoutes(serverRoutes))
    }
}