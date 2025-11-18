import { deepExtend } from './deep-extend'
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
    ResponseObject
} from '@novice1/api-doc-generator/lib/generators/openapi/definitions'
import { RequestBodyObject } from '@novice1/api-doc-generator/lib/generators/postman/definitions'
import { BaseResponseUtil } from '@novice1/api-doc-generator/lib/utils/responses/baseResponseUtils'

// -------------------- TYPES --------------------

export type SchemaModel = Omit<SchemaObject3_1, 'allOf' | 'anyOf' | 'oneOf' | 'not' | 'items' | 'properties' | 'additionalProperties'> & {
    allOf?: Array<SchemaModel | ISchemaAdapter>;
    anyOf?: Array<SchemaModel | ISchemaAdapter>;
    oneOf?: Array<SchemaModel | ISchemaAdapter>;
    not?: SchemaModel | ISchemaAdapter;
    items?: SchemaModel | ISchemaAdapter;
    properties?: Record<string, SchemaModel | ISchemaAdapter>;
    additionalProperties?: boolean | SchemaModel | ISchemaAdapter;
}

export interface ISchemaAdapter {
    ref(): ReferenceObject
    toObject(): SchemaObject3_1
}

export type MediaTypeModel = Omit<MediaTypeObject, 'schema' | 'examples'> & {
    examples?: Record<string, ExampleObject | ReferenceObject | ExampleAdapter>
    schema?: SchemaModel | ReferenceObject | SchemaAdapter;
}

export interface OpenAPIRequestBodyObject {
    content: Record<string, MediaTypeObject>;
    description?: string;
    required?: boolean;
}

export type PostmanRequestBodyModel = RequestBodyObject

// -------------------- CLASSES --------------------

export class ExampleAdapter {

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

export class SchemaAdapter implements ISchemaAdapter {
    protected name: string
    protected schema: SchemaModel = {}

    constructor(name: string, schema?: SchemaModel) {
        this.name = name
        if (schema) {
            this.setSchema(schema);
        }
    }

    #convertOne(v: SchemaModel | ISchemaAdapter): SchemaObject3_1 | ReferenceObject {
        if ('ref' in v && typeof v.ref == 'function') {
            return v.ref()
        } else {
            return new SchemaAdapter('tmp', v as SchemaModel).toObject()
        }
    }

    #convertMany(v: Array<SchemaModel | ISchemaAdapter>): Array<SchemaObject3_1 | ReferenceObject> {
        const r: Array<SchemaObject3_1 | ReferenceObject> = []
        for (const element of v) {
            r.push(this.#convertOne(element))
        }
        return r
    }

    #convertObjectOf(v: Record<string, SchemaModel | ISchemaAdapter>): Record<string, SchemaObject3_1 | ReferenceObject> {
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

export class MediaTypeAdapter extends MediaTypeUtil {

    protected schema?: SchemaModel | SchemaAdapter

    protected examples?: Record<string, ExampleObject | ReferenceObject | ExampleAdapter>

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

    setExamples(examples: Record<string, ExampleObject | ReferenceObject | ExampleAdapter>): this {
        this.examples = examples
        return this
    }

    setSchema(schema: SchemaModel | SchemaAdapter): this {
        this.schema = schema
        return this
    }

    toObject(noRef?: boolean): MediaTypeObject {
        const withSchema: { schema?: SchemaObject3_1 | ReferenceObject, examples?: Record<string, ExampleObject | ReferenceObject> } = {};
        if (typeof this.schema !== 'undefined') {
            if (this.schema instanceof SchemaAdapter) {
                withSchema.schema = this.schema.ref()
            } else {
                withSchema.schema = new SchemaAdapter('tmp', this.schema).toObject()
            }
        }
        if (typeof this.examples !== 'undefined') {
            withSchema.examples = {}
            for (const key in this.examples) {
                const example = this.examples[key]
                if (example instanceof ExampleAdapter) {
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

export class RequestBodyAdapter {
    protected name: string;
    protected content: Record<string, MediaTypeAdapter> = {};
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

    addMediaType(contentType: string, mediaType: MediaTypeModel | MediaTypeAdapter = {}): this {
        this.content = this.content || {};
        if (mediaType instanceof MediaTypeAdapter) {
            this.content[contentType] = mediaType;
        } else {
            this.content[contentType] = new MediaTypeAdapter(mediaType);
        }
        return this;
    }

    ref(): ReferenceObject {
        return { $ref: this.requestBodyRef || `#/components/requestBodies/${this.name}` }
    }

    toPostman(): PostmanRequestBodyModel {
        const result: PostmanRequestBodyModel = {}
        for (const contentType in this.content) {
            const mediaTypeModel = this.content[contentType].toModel()
            const contentSchema = mediaTypeModel.schema
            result.mode = 'raw'
            if (contentType === 'multipart/form-data') {
                result.mode = 'form-data'
                result.formdata = []
                if (contentSchema) {
                    if (contentSchema instanceof SchemaAdapter) {
                        const rawSchema = contentSchema.toObject()
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
            } else if (!contentSchema || Object.keys(contentSchema).length === 0) {
                result.mode = 'file'
                result.disabled = false
            } else {
                // create raw value
                if (typeof mediaTypeModel.example !== 'undefined') {
                    result.raw = `${mediaTypeModel.example}`;
                }
                if (typeof mediaTypeModel.examples !== 'undefined' && Object.keys(mediaTypeModel.examples).length !== 0) {
                    for (const key in mediaTypeModel.examples) {
                        const example = mediaTypeModel.examples[key];
                        if (example instanceof ExampleAdapter) {
                            result.raw = `${example.getValue()}`;
                            break;
                        } else if (example && 'value' in example && typeof example.value !== 'undefined') {
                            result.raw = `${example.value}`;
                            break;
                        }
                    }
                }
            }
            break;
        }
        return result
    }

    toOpenAPI(): OpenAPIRequestBodyObject {
        const content: OpenAPIRequestBodyObject['content'] = {}
        for (const contentType in this.content) {
            const adapter = this.content[contentType]
            content[contentType] = adapter.toObject()
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
export class ResponseAdapter extends ResponseUtil {
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

    withContext(): ContextResponseAdapter {
        return new ContextResponseAdapter(this)
    }
}

export class ContextResponseAdapter extends ContextResponseUtil {
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
        if (this.responseUtil instanceof ResponseAdapter) {
            return this.responseUtil.toOpenAPIRefPreferred(ctxt);
        } else {
            return this.responseUtil.toOpenAPI(ctxt);
        }
    }
}

export class GroupResponseAdapter extends GroupResponseUtil {
    constructor(responseUtils: BaseResponseUtil[]) {
        super(responseUtils);
        this.responseUtils = responseUtils;
    }
    toOpenAPIRefPreferred(): Record<string, ResponseObject | ReferenceObject> {
        let r: Record<string, ResponseObject | ReferenceObject> = {};
        this.responseUtils.forEach(builder => {
            if (builder instanceof ResponseAdapter) {
                r = { ...r, ...builder.toOpenAPIRefPreferred() };
            } else {
                r = { ...r, ...builder.toOpenAPI() };
            }
        });
        return r;
    }
}

export function groupResponses(
    ...adapters: BaseResponseUtil[]
) {
    return new GroupResponseAdapter(adapters)
}
