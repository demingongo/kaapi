import type { KaapiOpenAPIHelperInterface } from '@kaapi/kaapi';
import { OpenAPIJsonHelper, PostmanJsonHelper } from '@novice1/api-doc-json-helper';
import type { Type, JsonSchema } from 'arktype';

function transformValue(value?: Type | object | unknown) {
    let r: unknown = value;
    if (value && typeof value === 'function' && 'toJsonSchema' in value && typeof value.toJsonSchema === 'function') {
        r = value.toJsonSchema({
            fallback: (v: Record<string, unknown>) => {
                const r: JsonSchema & { _instanceof?: string } = {};
                if (v && 'proto' in v && v.proto && typeof v.proto === 'function' && 'name' in v.proto) {
                    r.type = 'object';
                    r._instanceof = `${v.proto.name}`;
                }
                return r;
            },
        });
    }

    return r;
}

export class OpenAPIArkHelper extends OpenAPIJsonHelper implements KaapiOpenAPIHelperInterface {
    constructor(
        params: {
            value?: Type | object | unknown;
            isRoot?: boolean;
        },
        isRequired?: boolean
    ) {
        super({ ...params, value: transformValue(params.value) }, isRequired);
    }
    isFile(): boolean | undefined {
        if (!this.isValid()) return false;
        let r: boolean = false;
        const schema = this._schema;
        if ('properties' in schema && typeof schema.properties === 'object' && schema.properties) {
            const properties: Record<string, unknown> = schema.properties as Record<string, unknown>;
            r = !!(
                '_data' in properties &&
                properties._data &&
                typeof properties._data === 'object' &&
                '_instanceof' in properties._data &&
                properties._data._instanceof === 'Buffer'
            );
        }
        return r;
    }
    getFilesChildren(): Record<string, unknown> {
        const r: Record<string, unknown> = {};
        const schema = this._schema;
        if ('properties' in schema && typeof schema.properties === 'object' && schema.properties) {
            const properties: Record<string, unknown> = schema.properties as Record<string, unknown>;
            for (const p in properties) {
                const isRequired: boolean =
                    'required' in schema && Array.isArray(schema.required) && schema.required.includes(p);
                const ch = new OpenAPIArkHelper({ value: properties[p] }, isRequired);
                if (ch.isFile()) {
                    r[p] = properties[p];
                }
            }
        }
        return r;
    }
}

export class PostmanArkHelper extends PostmanJsonHelper {
    constructor(
        params: {
            value?: Type | object | unknown;
            isRoot?: boolean;
        },
        isRequired?: boolean
    ) {
        super({ ...params, value: transformValue(params.value) }, isRequired);
    }
}
