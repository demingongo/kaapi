import type { KaapiOpenAPIHelperInterface } from '@kaapi/kaapi';
import { OpenAPIJsonHelper, PostmanJsonHelper } from '@novice1/api-doc-json-helper';
import type { Type, JsonSchema } from 'arktype';

function transformValue(value?: Type | object | unknown) {
    let r: unknown = value;
    if (value && typeof value === 'function' && 'toJsonSchema' in value && typeof value.toJsonSchema === 'function') {
        r = (value as Type).toJsonSchema({
            fallback: (v) => {
                let r: JsonSchema & { _instanceof?: string } = {};
                let _instanceof = '';
                if (v && 'proto' in v && v.proto && typeof v.proto === 'function' && 'name' in v.proto) {
                    r.type = 'object';
                    r._instanceof = `${v.proto.name}`;
                    _instanceof = `${v.proto.name}`;
                }
                if (v.base) {
                    r = { ...r, ...v.base };
                    if ('out' in v && v.out) {
                        if ('anyOf' in r && 'type' in v.out) {
                            const description = r.anyOf[0]?.description;
                            r = { ...v.out };
                            if (description) {
                                r.description = description;
                            }
                            if (_instanceof) {
                                r._instanceof = _instanceof;
                            }
                        } else {
                            r = { ...r, ...v.out };
                        }
                    }
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
    isValid(): boolean {
        return !!(
            this._schema &&
            typeof this._schema === 'object' &&
            (('type' in this._schema && typeof this._schema.type === 'string') ||
                ('oneOf' in this._schema && Array.isArray(this._schema.oneOf)) ||
                ('anyOf' in this._schema && Array.isArray(this._schema.anyOf)) ||
                ('enum' in this._schema && Array.isArray(this._schema.enum)))
        );
    }
    getFirstItem(): OpenAPIArkHelper | undefined {
        const schema = this._schema;

        if ('items' in schema && typeof schema.items === 'object') {
            return new OpenAPIArkHelper({ value: schema.items });
        }

        return;
    }
    getChildren(): Record<string, OpenAPIArkHelper> {
        const r: Record<string, OpenAPIArkHelper> = {};
        const schema = this._schema;
        if ('properties' in schema && typeof schema.properties === 'object' && schema.properties) {
            const properties: Record<string, unknown> = schema.properties as Record<string, unknown>;
            for (const p in properties) {
                const isRequired: boolean =
                    'required' in schema && Array.isArray(schema.required) && schema.required.includes(p);
                r[p] = new OpenAPIArkHelper({ value: properties[p] }, isRequired);
            }
        }
        return r;
    }
    getAlternatives(): OpenAPIArkHelper[] {
        const r: OpenAPIArkHelper[] = [];
        const schema = this._schema;
        if ('oneOf' in schema && Array.isArray(schema.oneOf)) {
            for (const p of schema.oneOf) {
                r.push(new OpenAPIArkHelper({ value: p }));
            }
        }
        return r;
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
    isValid(): boolean {
        return !!(
            this._schema &&
            typeof this._schema === 'object' &&
            (('type' in this._schema && typeof this._schema.type === 'string') ||
                ('oneOf' in this._schema && Array.isArray(this._schema.oneOf)) ||
                ('anyOf' in this._schema && Array.isArray(this._schema.anyOf)) ||
                ('enum' in this._schema && Array.isArray(this._schema.enum)))
        );
    }
    getFirstItem(): PostmanArkHelper | undefined {
        const schema = this._schema;

        if ('items' in schema && typeof schema.items === 'object') {
            return new PostmanArkHelper({ value: schema.items });
        }

        return;
    }
    getChildren(): Record<string, PostmanArkHelper> {
        const r: Record<string, PostmanArkHelper> = {};
        const schema = this._schema;
        if ('properties' in schema && typeof schema.properties === 'object' && schema.properties) {
            const properties: Record<string, unknown> = schema.properties as Record<string, unknown>;
            for (const p in properties) {
                const isRequired: boolean =
                    'required' in schema && Array.isArray(schema.required) && schema.required.includes(p);
                r[p] = new PostmanArkHelper({ value: properties[p] }, isRequired);
            }
        }
        return r;
    }
    getAlternatives(): PostmanArkHelper[] {
        const r: PostmanArkHelper[] = [];
        const schema = this._schema;
        if ('oneOf' in schema && Array.isArray(schema.oneOf)) {
            for (const p of schema.oneOf) {
                r.push(new PostmanArkHelper({ value: p }));
            }
        }
        return r;
    }
}
