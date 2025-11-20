import { deepExtend } from './deep-extend'
import jsontoxml from 'jsontoxml'
import {
    ContextResponseUtil,
    GroupResponseUtil,
    IOpenAPIResponseContext,
    MediaTypeUtil,
    ReferenceObject,
    ResponseUtil,
    SchemaObject3_1
} from '@novice1/api-doc-generator'
import {
    ExampleObject,
    MediaTypeObject,
    ResponseObject,
    XMLObject
} from '@novice1/api-doc-generator/lib/generators/openapi/definitions'
import { HeaderObject, RequestBodyObject } from '@novice1/api-doc-generator/lib/generators/postman/definitions'
import { BaseResponseUtil } from '@novice1/api-doc-generator/lib/utils/responses/baseResponseUtils'

// -------------------- TYPES --------------------

export type SchemaModel = Omit<SchemaObject3_1, 'allOf' | 'anyOf' | 'oneOf' | 'not' | 'items' | 'properties' | 'additionalProperties'> & {
    allOf?: Array<SchemaModel | ISchemaModifier>;
    anyOf?: Array<SchemaModel | ISchemaModifier>;
    oneOf?: Array<SchemaModel | ISchemaModifier>;
    not?: SchemaModel | ISchemaModifier;
    items?: SchemaModel | ISchemaModifier;
    properties?: Record<string, SchemaModel | ISchemaModifier>;
    additionalProperties?: boolean | SchemaModel | ISchemaModifier;
}

export interface ISchemaModifier {
    ref(): ReferenceObject
    toObject(): SchemaObject3_1
}

export type MediaTypeModel = Omit<MediaTypeObject, 'schema' | 'examples'> & {
    examples?: Record<string, ExampleObject | ReferenceObject | ExampleModifier>
    schema?: SchemaModel | ReferenceObject | SchemaModifier;
}

export interface OpenAPIRequestBodyObject {
    content: Record<string, MediaTypeObject>;
    description?: string;
    required?: boolean;
}

export type PostmanRequestBodyModel = {
    body: RequestBodyObject;
    header: HeaderObject[];
}

// -------------------- CLASSES --------------------

export class ExampleModifier {

    protected name: string
    protected value: unknown
    protected externalValue?: string
    protected summary?: string;
    protected description?: string;

    constructor(name: string, example?: ExampleObject) {
        this.name = name
        if (example) {
            this.value = example.value
            this.externalValue = example.externalValue
            this.summary = example.summary
            this.description = example.description
        }
    }

    getName(): string {
        return this.name
    }

    setValue(value: unknown): this {
        this.value = value
        return this
    }

    getValue(): unknown {
        return this.value
    }

    setExternalValue(externalValue: string): this {
        this.externalValue = externalValue
        return this
    }

    getExternalValue(): string | undefined {
        return this.externalValue
    }

    setSummary(summary: string): this {
        this.summary = summary
        return this
    }

    getSummary(): string | undefined {
        return this.summary
    }

    setDescription(description: string): this {
        this.description = description
        return this
    }

    getDescription(): string | undefined {
        return this.description
    }

    ref(): ReferenceObject {
        return { $ref: `#/components/examples/${this.name}` }
    }

    toObject(): ExampleObject {
        return {
            description: this.description,
            externalValue: this.externalValue,
            summary: this.summary,
            value: this.value
        }
    }

    toJSON(): ExampleObject {
        return this.toObject()
    }
}

export class SchemaModifier implements ISchemaModifier {
    protected name: string
    protected schema: SchemaModel = {}

    constructor(name: string, schema?: SchemaModel) {
        this.name = name
        if (schema) {
            this.setSchema(schema);
        }
    }

    #convertOne(v: SchemaModel | ISchemaModifier): SchemaObject3_1 | ReferenceObject {
        if ('ref' in v && typeof v.ref == 'function') {
            return v.ref()
        } else {
            return new SchemaModifier('tmp', v as SchemaModel).toObject()
        }
    }

    #convertMany(v: Array<SchemaModel | ISchemaModifier>): Array<SchemaObject3_1 | ReferenceObject> {
        const r: Array<SchemaObject3_1 | ReferenceObject> = []
        for (const element of v) {
            r.push(this.#convertOne(element))
        }
        return r
    }

    #convertObjectOf(v: Record<string, SchemaModel | ISchemaModifier>): Record<string, SchemaObject3_1 | ReferenceObject> {
        const r: Record<string, SchemaObject3_1 | ReferenceObject> = {}
        for (const k in v) {
            const vk = v[k]
            r[k] = (this.#convertOne(vk))
        }
        return r
    }

    getName(): string {
        return this.name
    }

    setSchema(schema: SchemaModel): this {
        this.schema = schema;
        return this
    }

    ref(): ReferenceObject {
        return { $ref: `#/components/schemas/${this.name}` }
    }

    toObject(): SchemaObject3_1 {
        const { allOf, anyOf, oneOf, not, items, properties, additionalProperties, ...value } = this.schema
        const valueToKeep: SchemaObject3_1 = value
        if (allOf) {
            valueToKeep.allOf = this.#convertMany(allOf)
        }
        if (anyOf) {
            valueToKeep.anyOf = this.#convertMany(anyOf)
        }
        if (oneOf) {
            valueToKeep.oneOf = this.#convertMany(oneOf)
        }
        if (not) {
            valueToKeep.not = this.#convertOne(not)
        }
        if (items) {
            valueToKeep.items = this.#convertOne(items)
        }
        if (properties) {
            valueToKeep.properties = this.#convertObjectOf(properties)
        }
        if (typeof additionalProperties !== 'undefined') {
            if (typeof additionalProperties === 'boolean') {
                valueToKeep.additionalProperties = additionalProperties
            } else {
                valueToKeep.additionalProperties = this.#convertOne(additionalProperties)
            }
        }
        return { ...valueToKeep };
    }

    toJSON(): SchemaObject3_1 {
        return this.toObject()
    }
}

export class MediaTypeModifier extends MediaTypeUtil {

    protected schema?: SchemaModel | SchemaModifier

    protected examples?: Record<string, ExampleObject | ReferenceObject | ExampleModifier>

    constructor(mediaType?: MediaTypeModel) {
        if (mediaType) {
            const { examples, schema, ...rest } = mediaType
            super(rest)
            if (examples) {
                this.setExamples(examples)
            }
            if (schema) {
                this.setSchema(schema)
            }
        } else {
            super()
        }
    }

    setExamples(examples: Record<string, ExampleObject | ReferenceObject | ExampleModifier>): this {
        this.examples = examples
        return this
    }

    setSchema(schema: SchemaModel | SchemaModifier): this {
        this.schema = schema
        return this
    }

    toObject(noRef?: boolean): MediaTypeObject {
        const withSchema: { schema?: SchemaObject3_1 | ReferenceObject, examples?: Record<string, ExampleObject | ReferenceObject> } = {};
        if (typeof this.schema !== 'undefined') {
            if (this.schema instanceof SchemaModifier) {
                withSchema.schema = this.schema.ref()
            } else {
                withSchema.schema = new SchemaModifier('tmp', this.schema).toObject()
            }
        }
        if (typeof this.examples !== 'undefined') {
            withSchema.examples = {}
            for (const key in this.examples) {
                const example = this.examples[key]
                if (example instanceof ExampleModifier) {
                    if (noRef) {
                        withSchema.examples[key] = example.toObject()
                    } else {
                        withSchema.examples[key] = example.ref()
                    }
                } else {
                    withSchema.examples[key] = example
                }
            }
        }
        const copy: MediaTypeObject = deepExtend(super.toObject(), withSchema);
        return copy;
    }

    toModel(): MediaTypeModel {
        return { ...super.toObject(), schema: this.schema, examples: this.examples };
    }
}

function isContentFileSchema(schema: SchemaModel | ReferenceObject | SchemaModifier): boolean {
    let r = false;
    let nbProps = 0;

    if ('type' in schema) {
        if (schema.type !== 'string') {
            return r
        }
        nbProps++;
    }
    if ('contentMediaType' in schema) {
        nbProps++;
    }
    if ('contentEncoding' in schema) {
        nbProps++;
    }
    if ('$ref' in schema) {
        nbProps++;
    }
    if ('$schema' in schema) {
        nbProps++;
    }

    if (nbProps === Object.keys(schema).length) {
        r = true
    }

    return r;
}

interface JsontoxmlSample {
    name: string;
    text?: string;
    attrs?: Record<string, string>;
    children?: JsontoxmlSample[];
}

function createElementJsontoxmlSample(name: string, schema: SchemaObject3_1 | ReferenceObject): JsontoxmlSample {
    const res: JsontoxmlSample = {
        name
    };
    if ('xml' in schema) {
        let prefix = '';
        const xml: XMLObject | undefined = schema.xml as (XMLObject | undefined);
        if (xml?.name) {
            res.name = xml.name;
        }
        if (xml?.prefix) {
            prefix = xml.prefix;
        }
        if (xml?.namespace) {
            const xmlns = prefix ? `xmlns:${prefix}` : `xmlns:${res.name}`;
            res.attrs = {
                [xmlns]: xml.namespace
            };
        }
        if (prefix) {
            res.name = `${prefix}:${res.name}`;
        }
    }
    return res
}

function formatJsontoxmlSample(json: JsontoxmlSample, properties: Record<string, SchemaObject3_1 | ReferenceObject>) {
    for (const propName in properties) {
        const propSchema = properties[propName];
        const jsonChild = createJsontoxmlSample(propName, propSchema);
        if ('xml' in propSchema) {
            const xmlObject = propSchema.xml as (XMLObject | undefined);
            if (xmlObject?.attribute) {
                json.attrs = json.attrs || {};
                json.attrs[propName] = jsonChild.text || '';
            } else {
                json.children = json.children || [];
                json.children.push(jsonChild);
            }
        } else {
            json.children = json.children || [];
            json.children.push(jsonChild);
        }
    }
}

function createJsontoxmlSample(name: string, schema: SchemaObject3_1 | ReferenceObject): JsontoxmlSample {
    const res: JsontoxmlSample = createElementJsontoxmlSample(name, schema);

    if ('type' in schema) {
        if (schema.type === 'array') {
            // no overdo: do not support anyOf or oneOf here
            if (schema.items && 'type' in schema.items && typeof schema.items.type === 'string') {
                let text: string | undefined;
                const itemType = schema.items.type
                const itemSchema = schema.items
                if (typeof itemSchema.default !== 'undefined') {
                    text = `${itemSchema.default}`
                } else if (itemSchema.examples?.length) {
                    text = `${itemSchema.examples[0]}`
                } else if (itemSchema.format) {
                    text = `(${itemSchema.format})`
                } else if (itemType) {
                    text = `(${itemType})`
                }
                if (text) {
                    res.text = text;
                }
            }
        } else if (schema.type === 'object' && schema.properties && Object.keys(schema.properties).length) {
            formatJsontoxmlSample(res, schema.properties)
        } else {
            let text: string | undefined;
            if (typeof schema.default !== 'undefined') {
                text = `${schema.default}`
            } else if (schema.examples?.length) {
                text = `${schema.examples[0]}`
            } else if (schema.format) {
                text = `(${schema.format})`
            } else if (schema.type) {
                text = `(${schema.type})`
            }
            if (text) {
                res.text = text;
            }
        }
    }
    return res
}

function createRawSample(schema: SchemaObject3_1 | ReferenceObject, deepLevel = 0): unknown {
    let sample: unknown;
    if (deepLevel > 9 || !Object.keys(schema).length) {
        return;
    }
    if ('$ref' in schema && Object.keys(schema).length === 1) {
        return
    }

    if ('default' in schema && typeof schema.default !== 'undefined') {
        // default value
        sample = schema.default
    } else if ('enum' in schema && Array.isArray(schema.enum) && schema.enum.length) {
        // default value
        sample = schema.enum[0]
    } else if ('examples' in schema && Array.isArray(schema.examples) && schema.examples.length) {
        // first example value
        sample = schema.examples[0]
    } else if ('anyOf' in schema && Array.isArray(schema.anyOf) && schema.anyOf.length) {
        // first example value
        sample = createRawSample(schema.anyOf[0], deepLevel + 1)
    } else if ('oneOf' in schema && Array.isArray(schema.oneOf) && schema.oneOf.length) {
        // first example value
        sample = createRawSample(schema.oneOf[0], deepLevel + 1)
    } else if ('type' in schema) {
        if (schema.type === 'object') {
            const obj: Record<string, unknown> = {};
            if (schema.properties) {
                const props = schema.properties
                Object.keys(props).forEach(
                    name => {
                        obj[name] = createRawSample(props[name], deepLevel + 1);
                    }
                );
            }
            sample = obj;
        } else if (schema.type === 'array') {
            const arr: unknown[] = [];
            if (schema.items) {
                const itemSample = createRawSample(schema.items, deepLevel + 1);
                if (itemSample) {
                    arr.push(itemSample);
                }
            }
            sample = arr;
        } else if (schema.type === 'number' || schema.type === 'integer') {
            sample = schema.minimum ? schema.minimum : (schema.exclusiveMinimum ? schema.exclusiveMinimum : 0);
        } else if (schema.type === 'boolean') {
            sample = false
        } else if (schema.format) {
            sample = `<${schema.format}>`
        } else if (schema.type === 'string') {
            sample = ''
        } else {
            sample = `<${schema.type}>`
        }
    }

    return sample;
}

export class RequestBodyDocsModifier {
    protected name: string;
    protected content: Record<string, MediaTypeModifier> = {};
    protected description?: string;
    protected required?: boolean;
    protected requestBodyRef?: string;

    constructor(name?: string) {
        this.name = name || this.constructor.name;
    }

    /**
     *
     * @param description A short description of the response.
     * CommonMark syntax MAY be used for rich text representation.
     */
    setDescription(description: string): this {
        this.description = description;
        return this;
    }

    setName(name: string): this {
        this.name = name;
        return this;
    }

    setRequired(isRequired: boolean): this {
        this.required = isRequired;
        return this;
    }

    setRef(requestBodyRef: string): this {
        this.requestBodyRef = requestBodyRef;
        return this;
    }

    getDescription(): string | undefined {
        return this.description;
    }

    getName(): string {
        return this.name;
    }

    isRequired(): boolean {
        return !!this.required;
    }

    addMediaType(contentType: string, mediaType: MediaTypeModel | MediaTypeModifier = {}): this {
        this.content = this.content || {};
        if (mediaType instanceof MediaTypeModifier) {
            this.content[contentType] = mediaType;
        } else {
            this.content[contentType] = new MediaTypeModifier(mediaType);
        }
        return this;
    }

    ref(): ReferenceObject {
        return { $ref: this.requestBodyRef || `#/components/requestBodies/${this.name}` }
    }

    toPostman(): PostmanRequestBodyModel {
        const result: PostmanRequestBodyModel['body'] = {}
        const header: PostmanRequestBodyModel['header'] = []
        for (const contentType in this.content) {
            header.push({
                key: 'Content-Type',
                value: contentType
            });
            const mediaTypeModel = this.content[contentType].toModel()
            const contentSchema = mediaTypeModel.schema
            result.mode = 'raw'
            if (contentType === 'multipart/form-data') {
                result.mode = 'formdata'
                result.formdata = []
                if (contentSchema) {
                    const rawSchema: SchemaObject3_1 | undefined = contentSchema instanceof SchemaModifier ?
                        contentSchema.toObject() : (
                            !('$ref' in contentSchema) ? new SchemaModifier('tmp', contentSchema).toObject() : undefined
                        )
                    if (rawSchema) {
                        if (rawSchema.properties) {
                            for (const key in rawSchema.properties) {
                                const propSchema = rawSchema.properties[key]
                                if ('$ref' in propSchema) {
                                    result.formdata.push({
                                        key,
                                        type: 'text'
                                    })
                                } else {
                                    const fieldType = propSchema.contentMediaType ? 'file' : 'text'
                                    result.formdata.push({
                                        key,
                                        type: fieldType,
                                        description: propSchema.description,
                                        src: fieldType === 'file' ? [] : undefined,
                                        disabled: rawSchema.required?.includes(key) ? false : true
                                    })
                                }
                            }
                        }
                    }
                }
            } else if (!contentSchema || isContentFileSchema(contentSchema)) {
                result.mode = 'file'
                result.file = {
                    src: ''
                }
                result.disabled = false
            } else {
                // create raw value
                if (typeof mediaTypeModel.example !== 'undefined') {
                    result.raw = `${mediaTypeModel.example}`;
                }
                if (typeof mediaTypeModel.examples !== 'undefined' && Object.keys(mediaTypeModel.examples).length !== 0) {
                    for (const key in mediaTypeModel.examples) {
                        const example = mediaTypeModel.examples[key];
                        if (example instanceof ExampleModifier) {
                            result.raw = `${example.getValue()}`;
                            break;
                        } else if (example && 'value' in example && typeof example.value !== 'undefined') {
                            result.raw = `${example.value}`;
                            break;
                        }
                    }
                    // if no raw content was set
                    if (!result.raw) {
                        const rawSchema: SchemaObject3_1 | undefined = contentSchema instanceof SchemaModifier ?
                            contentSchema.toObject() : (
                                !('$ref' in contentSchema) ? new SchemaModifier('tmp', contentSchema).toObject() : undefined
                            )
                        if (rawSchema) {
                            if (contentType === 'application/xml') {
                                // xml
                                const json: JsontoxmlSample = createElementJsontoxmlSample(
                                    'element',
                                    rawSchema
                                );
                                if ('properties' in rawSchema && rawSchema.properties) {
                                    formatJsontoxmlSample(json, rawSchema.properties)
                                }
                                result.raw = jsontoxml([json], {
                                    xmlHeader: true,
                                    indent: ' '
                                });
                            } else {
                                const sample = createRawSample(rawSchema)
                                if (typeof sample !== 'undefined') {
                                    result.raw = JSON.stringify(sample, null, '\t');
                                }
                            }
                        }
                    }
                }
            }
            break;
        }
        return { header, body: result }
    }

    toOpenAPI(): OpenAPIRequestBodyObject {
        const content: OpenAPIRequestBodyObject['content'] = {}
        for (const contentType in this.content) {
            const modifier = this.content[contentType]
            content[contentType] = modifier.toObject()
        }
        const result: OpenAPIRequestBodyObject = {
            content
        }

        if (this.description) {
            result.description = this.description
        }

        if (this.isRequired()) {
            result.required = true
        }

        return result
    }
}

/**
 * Set a name (setName) or a ref (setRef) for it to be used as a reference.
 */
export class ResponseDocsModifier extends ResponseUtil {
    constructor(name?: string) {
        super(name);
        if (!name)
            this.setName('')
    }
    toOpenAPIRefPreferred(): Record<string, ResponseObject | ReferenceObject>;
    toOpenAPIRefPreferred(ctxt: IOpenAPIResponseContext): Record<string, ResponseObject | ReferenceObject>;
    toOpenAPIRefPreferred(ctxt: IOpenAPIResponseContext = {}): Record<string, ResponseObject | ReferenceObject> {
        let name = this.name;
        if (this.code) {
            name = `${this.code}`;
        }
        if (ctxt.code) {
            name = `${ctxt.code}`;
        }
        if (ctxt.default) {
            name = 'default';
        }
        if (this.default) {
            name = 'default';
        }
        if (ctxt.ref) {
            return {
                [name]: {
                    $ref: ctxt.ref
                }
            };
        }
        if (this.ref) {
            return {
                [name]: {
                    $ref: this.ref
                }
            };
        }
        if (this.name) {
            return {
                [name]: {
                    $ref: `#/components/responses/${this.name}`
                }
            }
        }
        return this.toOpenAPI(ctxt)
    }

    withContext(): ContextResponseDocsModifier {
        return new ContextResponseDocsModifier(this)
    }
}

export class ContextResponseDocsModifier extends ContextResponseUtil {
    toOpenAPI(): Record<string, ResponseObject | ReferenceObject> {
        const ctxt: IOpenAPIResponseContext = {};
        if (this.code) {
            ctxt.code = this.code;
        }
        if (this.ref) {
            ctxt.ref = this.ref;
        }
        if (this.links) {
            ctxt.links = this.links;
        }
        if (this.default) {
            ctxt.default = this.default;
        }
        if (this.responseUtil instanceof ResponseDocsModifier) {
            return this.responseUtil.toOpenAPIRefPreferred(ctxt);
        } else {
            return this.responseUtil.toOpenAPI(ctxt);
        }
    }
}

export class GroupResponseDocsModifier extends GroupResponseUtil {
    constructor(responseUtils: BaseResponseUtil[]) {
        super(responseUtils);
        this.responseUtils = responseUtils;
    }
    toOpenAPIRefPreferred(): Record<string, ResponseObject | ReferenceObject> {
        let r: Record<string, ResponseObject | ReferenceObject> = {};
        this.responseUtils.forEach(builder => {
            if (builder instanceof ResponseDocsModifier) {
                r = { ...r, ...builder.toOpenAPIRefPreferred() };
            } else {
                r = { ...r, ...builder.toOpenAPI() };
            }
        });
        return r;
    }
}

export function groupResponses(
    ...modifiers: BaseResponseUtil[]
) {
    return new GroupResponseDocsModifier(modifiers)
}
