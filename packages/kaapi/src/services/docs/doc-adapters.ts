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

export type SchemaModel = SchemaObject3_1 & {
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
    toObject(): SchemaModel
    toJSON(): SchemaModel
}

export type MediaTypeModel = Omit<MediaTypeObject, 'schema' | 'examples'> & {
    examples?: Record<string, ExampleObject | ReferenceObject | ExampleAdapter>
    schema?: SchemaModel | ReferenceObject | SchemaAdapter;
}

export interface OpenAPIRequestBodyModel {
    content: Record<string, MediaTypeModel>;
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

    private _convertOneShape(v: SchemaModel | ReferenceObject | ISchemaAdapter): SchemaModel | ReferenceObject {
        return 'ref' in v && typeof v.ref == 'function' ? v.ref() : { ...(v as SchemaModel | ReferenceObject) }
    }

    private _convertManyShapes(v: Array<SchemaModel | ReferenceObject | ISchemaAdapter>): Array<SchemaModel | ReferenceObject> {
        const r: Array<SchemaModel | ReferenceObject> = []
        for (const element of v) {
            r.push(this._convertOneShape(element))
        }
        return r
    }

    private _convertObjectOfShapes(v: Record<string, SchemaModel | ReferenceObject | ISchemaAdapter>): Record<string, SchemaModel | ReferenceObject> {
        const r: Record<string, SchemaModel | ReferenceObject> = {}
        for (const k in v) {
            r[k] = (this._convertOneShape(v[k]))
        }
        return r
    }

    getName(): string {
        return this.name
    }

    setSchema(schema: SchemaModel): this {
        const { allOf, anyOf, oneOf, not, items, properties, ...value } = schema
        const valueToKeep: SchemaModel = value
        if (allOf) {
            valueToKeep.allOf = this._convertManyShapes(allOf)
        }
        if (anyOf) {
            valueToKeep.anyOf = this._convertManyShapes(anyOf)
        }
        if (oneOf) {
            valueToKeep.oneOf = this._convertManyShapes(oneOf)
        }
        if (not) {
            valueToKeep.not = this._convertOneShape(not)
        }
        if (items) {
            valueToKeep.items = this._convertOneShape(items)
        }
        if (properties) {
            valueToKeep.properties = this._convertObjectOfShapes(properties)
        }
        this.schema = deepExtend({}, value);
        return this
    }

    ref(): ReferenceObject {
        return { $ref: `#/components/schemas/${this.name}` }
    }

    toObject(): SchemaModel {
        return deepExtend({}, this.schema);
    }

    toJSON(): SchemaModel {
        return this.toObject()
    }
}

export class MediaTypeAdapter extends MediaTypeUtil {
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

    setExamples(examples: Record<string, ExampleObject | ReferenceObject | ExampleAdapter>, noRef?: boolean): this {
        const value: Record<string, ExampleObject | ReferenceObject> = {}
        for (const key in examples) {
            const example = examples[key]
            if (example instanceof ExampleAdapter) {
                if (noRef) {
                    value[key] = example.toObject()
                } else {
                    value[key] = example.ref()
                }
            } else {
                value[key] = example
            }
        }
        super.setExamples(value)
        return this
    }

    setSchema(schema: ReferenceObject | SchemaModel | SchemaAdapter, noRef?: boolean): this {
        const value: ReferenceObject | SchemaModel = schema instanceof SchemaAdapter ?
            noRef ? schema.toObject() : schema.ref() : schema;
        super.setSchema(value)
        return this
    }
}

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
        return super.toOpenAPI(ctxt)
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

export class GroupResponseShape extends GroupResponseUtil {
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

export class RequestBodyAdapter {
    protected name: string;
    protected content: Record<string, MediaTypeModel> = {};
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
            this.content[contentType] = mediaType.toObject();
        } else {
            this.content[contentType] = mediaType;
        }
        return this;
    }

    ref(): ReferenceObject {
        return { $ref: this.requestBodyRef || `#/components/requestBodies/${this.name}` }
    }

    toPostman(): PostmanRequestBodyModel {
        return {}
    }

    toOpenAPI(): OpenAPIRequestBodyModel {
        const result: OpenAPIRequestBodyModel = {
            content: { ...this.content }
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