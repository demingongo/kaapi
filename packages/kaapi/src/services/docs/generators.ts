import { OpenAPI, ProcessedRoute } from '@novice1/api-doc-generator';
import { KaapiServerRoute } from '@kaapi/server';
import { RouteMeta } from '@novice1/routing';
import { ReqRef, ReqRefDefaults } from '@hapi/hapi';

export interface KaapiDocGenerator {
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoute: KaapiServerRoute<Refs>): ProcessedRoute[];
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[]): ProcessedRoute[];
}

export class KaapiOpenAPI extends OpenAPI implements KaapiDocGenerator {
    addRoutes<Refs extends ReqRef = ReqRefDefaults>(serverRoutes: KaapiServerRoute<Refs>[] | KaapiServerRoute<Refs>): ProcessedRoute[] {

        let sRoutes: KaapiServerRoute<Refs>[] = [];

        if (Array.isArray(serverRoutes)) {
            sRoutes = serverRoutes
        } else {
            sRoutes = [serverRoutes]
        }

        const routes: RouteMeta[] = [] 
        
        sRoutes.forEach(sRoute => {
            // only string paths
            if (typeof sRoute.path != 'string' ) return

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
                        route.parameters = sRoute.options?.validate ? { ...sRoute.options?.validate, body: sRoute.options?.validate.payload, /*files: sRoute.files*/ } : undefined
                        if (route.parameters && sRoute.options?.payload?.allow) {
                            route.parameters.consumes = Array.isArray(sRoute.options.payload.allow) ? sRoute.options.payload.allow : [sRoute.options.payload.allow];
                        }
                    }

                    return route;
                }
            )

            routes.push(...formattedRoutes)
        })

        return super.add(routes)
        
    }
}