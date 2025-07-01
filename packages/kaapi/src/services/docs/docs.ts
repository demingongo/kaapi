import {
    ExampleObject,
    LicenseObject,
    ReferenceObject,
    SchemaObject,
    ServerObject,
    TagObject
} from '@novice1/api-doc-generator/lib/generators/openapi/definitions'
import { Folder } from '@novice1/api-doc-generator/lib/generators/postman/definitions'
import { BaseAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils'
import { BaseResponseUtil } from '@novice1/api-doc-generator/lib/utils/responses/baseResponseUtils'
import { OpenAPIOptions, Postman, PostmanOptions } from '@novice1/api-doc-generator'
import { SwaggerUiGenerator, SwaggerUiOptions } from './SwaggerUiGenerator'
import { KaapiOpenAPI } from './generators'
import { HandlerDecorations, Lifecycle, ReqRef, ReqRefDefaults } from '@hapi/hapi'
import { KaapiServerRoute } from '@kaapi/server'
import Boom from '@hapi/boom'
import fs from 'node:fs'

const bootTime = Date.now();

function trimQuery(q: string) {
    return q && q.split('?')[0]
}

export type DocsTag = TagObject & Omit<Folder, 'item'>

export type DocsSwaggerUIOptions = Omit<Omit<SwaggerUiOptions, 'swaggerUrl'>, 'swaggerUrls'>

export type DocsRedocOptions = {
    customCss?: string
    customCssUrl?: string
    customJs?: string
}

export interface DocsLogo {
    url: string
    alt?: string
}

export interface DocsOptions {
    logo?: DocsLogo,
    tagGroups?: Record<string, string[]>
    redoc?: DocsRedocOptions
    swagger?: DocsSwaggerUIOptions
}

export interface DocsConfig {
    /**
     * Disable docs routes.
     */
    disabled?: boolean
    path?: string
    title?: string
    consumes?: string[]
    security?: BaseAuthUtil
    license?: LicenseObject | string
    version?: string
    host?: ServerObject
    examples?: Record<string, ReferenceObject | ExampleObject>
    schemas?: Record<string, SchemaObject | ReferenceObject>
    responses?: BaseResponseUtil
    tags?: DocsTag[]
    options?: DocsOptions

    openAPIOptions?: OpenAPIOptions
    postmanOptions?: PostmanOptions
}

export function createDocsRouter<Refs extends ReqRef = ReqRefDefaults>(
    path: string,
    { openapi, postman }: { openapi: KaapiOpenAPI, postman: Postman },
    options?: DocsOptions): [
        route: KaapiServerRoute<Refs>,
        handler: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>
    ] {

    const lastSlashPos = path.lastIndexOf('/')
    const prefix = path.substring(0, lastSlashPos || path.length)

    const ui = new SwaggerUiGenerator()

    return [
        {
            path: `${prefix}/{any*}`,
            method: '*'
        },
        (req, h) => {
            if (req.url.pathname == path) {
                const html = ui.generateHTML(
                    openapi.result(), 
                    options?.swagger,
                    options?.swagger?.swaggerOptions,
                    options?.swagger?.customCss,
                    options?.swagger?.customfavIcon,
                    null,
                    options?.swagger?.customSiteTitle
                )
                return h.response(html).header('Content-Type', 'text/html');
            } else if (req.url.pathname == `${path}${path.endsWith('/') ? '' : '/'}schema`) {
                if (req.query && 
                    typeof req.query === 'object' && 
                    'format' in req.query && 
                    req.query.format == 'postman') {
                    return postman.result()
                }
                return openapi.result()
            } else {
                if (trimQuery(req.url.pathname).endsWith('/package.json')) {
                    return Boom.notFound()
                } else if (trimQuery(req.url.pathname).endsWith('/swagger-ui-init.js')) {
                    return h.response(ui.swaggerInit).header('Content-Type', 'application/javascript');
                }

                try {
                    const cacheDuration = 24 * 60 * 60 * 1000; // ms

                    const posFileName = trimQuery(req.url.pathname).lastIndexOf('/');

                    let filepath = ''

                    const swaggerUiFile = ui.getAbsoluteSwaggerFsPath()
                        + trimQuery(req.url.pathname).substring(posFileName > -1 ? posFileName : 0)

                    if (fs.existsSync(swaggerUiFile)) {
                        filepath = swaggerUiFile
                    }

                    if (filepath) {
                        let readStreamOptions: { encoding?: BufferEncoding } = { encoding: 'utf-8' }
                        let cT = 'application/octet-stream'
                        if (filepath.endsWith('.js')) {
                            cT = 'application/javascript'
                        } else if (filepath.endsWith('.css')) {
                            cT = 'text/css'
                        } else if (filepath.endsWith('.png')) {
                            readStreamOptions = {}
                            cT = 'image/png'
                        }
                        return h.response(fs.createReadStream(filepath, readStreamOptions))
                            .ttl(cacheDuration).header(
                                'Last-Modified',
                                (new Date(bootTime)).toUTCString()
                            ).header('Content-Type', cT);
                    }
                } catch (e) {
                    console.error(e)
                }

                return Boom.notFound()
            }
        }
    ];
}