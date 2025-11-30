import type { KaapiOpenAPIHelperInterface } from '@kaapi/kaapi';
import { OpenAPIJsonHelper, PostmanJsonHelper } from '@novice1/api-doc-json-helper';
import { type, Type, type JsonSchema } from 'arktype';

/**
 * reformat anyOf to externalize common values for: 
 * - examples
 * - format
 * - description
 */
function reformatAnyOf(schema: JsonSchema) {
    if ('anyOf' in schema) {
        const propertiesToCheck: ('description' | 'examples' | 'format')[] = [];
        if (!schema.description) {
            propertiesToCheck.push('description')
        }
        if (!schema.examples) {
            propertiesToCheck.push('examples')
        }
        if (!schema.format) {
            propertiesToCheck.push('format')
        }
        const objects = schema.anyOf;
        for (const prop of propertiesToCheck) {
            // Get the value from the first object
            const firstElement = objects[0]
            if (firstElement && typeof firstElement === 'object') {
                const firstValue = firstElement[prop];

                // Helper to compare arrays ignoring order
                const arraysEqual = (a: unknown, b: unknown) => {
                    if (!Array.isArray(a) || !Array.isArray(b)) return false;
                    if (a.length !== b.length) return false;
                    const sortedA = [...a].sort();
                    const sortedB = [...b].sort();
                    return sortedA.every((val, i) => val === sortedB[i]);
                };

                // Check all objects
                const allSame = objects.every(obj => {
                    const val = obj[prop];
                    if (Array.isArray(firstValue) && Array.isArray(val)) {
                        return arraysEqual(firstValue, val);
                    }
                    return val === firstValue;
                });

                if (allSame) {
                    if (prop === 'description' && typeof firstValue === 'string') {
                        schema.description = firstValue;
                    } else if (prop === 'examples' && Array.isArray(firstValue)) {
                        schema.examples = firstValue;
                    } else if (prop === 'format' && typeof firstValue === 'string') {
                        schema.format = firstValue;
                    }
                }
            }
        }
    }
}

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

                if ('properties' in r) {
                    // because default values are not always in the schema (arktype bug)
                    const r2 = (value as Type).toJSON()
                    if ('in' in r2 &&
                        r2.in &&
                        typeof r2.in === 'object' &&
                        'optional' in r2.in) {
                        if (Array.isArray(r2.in.optional)) {
                            for (const prop of r2.in.optional) {
                                if (typeof prop === 'object' &&
                                    prop &&
                                    'key' in prop &&
                                    typeof prop.key === 'string' &&
                                    typeof r.properties[prop.key].default === 'undefined' &&
                                    'default' in prop &&
                                    typeof prop.default !== 'undefined'
                                ) {
                                    r.properties[prop.key].default = prop.default
                                }
                            }
                        }
                    }

                    // reformat anyOf schemas
                    for (const prop in r.properties) {
                        reformatAnyOf(r.properties[prop])
                    }
                }
                return r;
            },
        });
    }

    return r;
}

export class OpenAPIArkHelper extends OpenAPIJsonHelper implements KaapiOpenAPIHelperInterface {
    protected _originalSchema?: Type
    constructor(
        params: {
            value?: Type | object | unknown;
            isRoot?: boolean;
        },
        isRequired?: boolean
    ) {
        super({ ...params, value: transformValue(params.value) }, isRequired);
        if (params.value instanceof Type) {
            this._originalSchema = params.value
        }
    }
    isValid(): boolean {
        return !!(
            this._schema &&
            typeof this._schema === 'object' &&
            !('~standard' in this._schema) &&
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
    isRequired(): boolean {
        let r = super.isRequired()
        if (!r && this._originalSchema) {
            const schema = this._schema;
            // if there is at least one required property
            if ('required' in schema &&
                Array.isArray(schema.required) &&
                'properties' in schema &&
                typeof schema.properties === 'object' &&
                schema.properties &&
                schema.required.length <= Object.keys(schema.properties).length
            ) {
                r = true
            }
        }
        return r;
    }
    getFilesChildren(): Record<string, unknown> {
        const r: Record<string, unknown> = {};
        const schema = this._schema;
        if ('properties' in schema && typeof schema.properties === 'object' && schema.properties) {
            const properties: Record<string, unknown> = schema.properties as Record<string, unknown>;
            if (this._originalSchema) {
                const betterR: Record<string, Type> = {}
                for (const p in properties) {
                    const isRequired: boolean =
                        'required' in schema && Array.isArray(schema.required) && schema.required.includes(p);
                    const ch = new OpenAPIArkHelper({ value: properties[p] }, isRequired);
                    if (ch.isFile()) {
                        const propOriginalSchema = (this._originalSchema as Type<Record<string, unknown>>)?.props?.find(v => v.key === p)
                        if (propOriginalSchema) {
                            let key = p;
                            if (!isRequired) {
                                key = `${p}?` // set it as optional
                            }
                            betterR[key] = propOriginalSchema.value
                        }
                    }
                }
                if (Object.keys(betterR).length) {
                    return type<unknown, Type<typeof betterR>>(betterR) as unknown as Record<string, unknown>
                }
            } else {
                for (const p in properties) {
                    const isRequired: boolean =
                        'required' in schema && Array.isArray(schema.required) && schema.required.includes(p);
                    const ch = new OpenAPIArkHelper({ value: properties[p] }, isRequired);
                    if (ch.isFile()) {
                        r[p] = properties[p];
                    }
                }
            }
        }
        return r;
    }
}

export class PostmanArkHelper extends PostmanJsonHelper {
    protected _originalSchema?: Type
    constructor(
        params: {
            value?: Type | object | unknown;
            isRoot?: boolean;
        },
        isRequired?: boolean
    ) {
        super({ ...params, value: transformValue(params.value) }, isRequired);
        if (params.value instanceof Type) {
            this._originalSchema = params.value
        }
    }
    isValid(): boolean {
        return !!(
            this._schema &&
            typeof this._schema === 'object' &&
            !('~standard' in this._schema) &&
            (('type' in this._schema && typeof this._schema.type === 'string') ||
                ('oneOf' in this._schema && Array.isArray(this._schema.oneOf)) ||
                ('anyOf' in this._schema && Array.isArray(this._schema.anyOf)) ||
                ('enum' in this._schema && Array.isArray(this._schema.enum)))
        );
    }
    isRequired(): boolean {
        let r = super.isRequired()
        if (!r && this._originalSchema) {
            const schema = this._schema;
            // if there is at least one required property
            if ('required' in schema &&
                Array.isArray(schema.required) &&
                'properties' in schema &&
                typeof schema.properties === 'object' &&
                schema.properties &&
                schema.required.length <= Object.keys(schema.properties).length
            ) {
                r = true
            }
        }
        return r;
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
