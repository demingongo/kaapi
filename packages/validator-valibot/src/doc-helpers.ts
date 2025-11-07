import type { BaseHelperInterface } from '@novice1/api-doc-generator/lib/helpers/baseHelper';
import { type JSONSchema7, toJsonSchema } from '@valibot/to-json-schema';
import {
    object,
    type ObjectEntries,
    type AnySchema
} from 'valibot';
import type { NonEmptyValibotSchema } from './types';
import type { OpenAPIHelperInterface, PostmanHelperInterface } from '@novice1/api-doc-generator';
import type {
    AdditionalProperties,
    DiscriminatorObject,
    EncodingObject,
    ExampleObject,
    ReferenceObject,
    XMLObject
} from '@novice1/api-doc-generator/lib/generators/openapi/definitions';
import type { KaapiOpenAPIHelperInterface } from '@kaapi/kaapi';

/**
 * Valibot helper for \@novice1/api-doc-generator
 */
export abstract class BaseValibotHelper implements BaseHelperInterface {
    protected _schema: JSONSchema7;
    protected _valibotSchema?: NonEmptyValibotSchema;
    protected _isRequired = false

    constructor({ value: schema = {} }: { value?: object | unknown, isRoot?: boolean }, isRequired?: boolean) {
        this._schema = {}
        if (schema && typeof schema === 'object') {
            if ('type' in schema && schema.type === 'instance' &&
                'kind' in schema && schema.kind === 'schema'
            ) {
                // special schemas that cannot be converted to JSON
                this._valibotSchema = schema as NonEmptyValibotSchema
            }
            try {
                const s = toJsonSchema(schema as AnySchema, { errorMode: 'ignore' })
                this._schema = s
                this._valibotSchema = schema as NonEmptyValibotSchema
            } catch (_e) {
                //
            }
        }
        if (isRequired) {
            this._isRequired = isRequired
        }
    }

    #getAllMeta(): Record<PropertyKey, unknown> {
        if (this.isValid() && this._valibotSchema && 'pipe' in this._valibotSchema &&
            Array.isArray(this._valibotSchema.pipe)) {
            const r = this._valibotSchema.pipe.find(v => v.type === 'metadata' && v.kind === 'metadata')
            return r || {}
        }

        return {}
    }

    protected hasMeta(v: string): boolean {
        return typeof this.#getAllMeta()[v] !== 'undefined'
    }

    protected getMeta(v: string): unknown {
        return this.#getAllMeta()[v];
    }

    isValid(): boolean {
        return !!(this._valibotSchema && this._schema.$schema)
    }
    getType(): string {
        let r = ''

        if ('type' in this._schema && typeof this._schema.type === 'string') {
            r = this._schema.type
        }

        if ('format' in this._schema && typeof this._schema.format === 'string') {
            r = this._schema.format
        }

        return r;
    }
    getDescription(): string {
        let r = ''

        if ('description' in this._schema && typeof this._schema.description === 'string') {
            r = this._schema.description
        }

        return r;
    }
    isRequired(): boolean {
        return this._isRequired
    }
    isUnique(): boolean {
        return !!('uniqueItems' in this._schema && this._schema.uniqueItems)
    }
    hasDefaultValue(): boolean {
        return !!('default' in this._schema && typeof this._schema.default != 'undefined')
    }
    getDefaultValue(): unknown {
        return 'default' in this._schema ? this._schema.default : undefined
    }
    hasExampleValue(): boolean {
        const schema = this._schema
        return !!('examples' in schema && Array.isArray(schema.examples) && schema.examples.length)
    }
    getExampleValue(): unknown {
        const schema = this._schema
        if ('examples' in schema && Array.isArray(schema.examples) && schema.examples.length) {
            return schema.examples[0]
        }
        return
    }
    isDeprecated(): boolean {
        return !!this.getMeta('deprecated')
    }
    allowsEmptyValue(): boolean {
        let r = false;
        if ('enum' in this._schema && Array.isArray(this._schema.enum)) {
            const enume = this._schema.enum
            r = ['', null].some(v => enume.includes(v))
        }
        return r;
    }
    getEnum(): unknown[] {
        let r: unknown[] = []
        if ('enum' in this._schema && Array.isArray(this._schema.enum)) {
            r = this._schema.enum
        } else if ('anyOf' in this._schema && Array.isArray(this._schema.anyOf)) {
            for (const p of this._schema.anyOf) {
                if (p && typeof p === 'object' && 'const' in p) {
                    r.push(p.const)
                }
            }
        }
        return r;
    }
    hasMin(): boolean {
        return 'minProperties' in this._schema || 'minItems' in this._schema || 'minimum' in this._schema || 'minLength' in this._schema
    }
    hasMax(): boolean {
        return 'maxProperties' in this._schema || 'maxItems' in this._schema || 'maximum' in this._schema || 'maxLength' in this._schema
    }
    getMin(): number | undefined {
        if ('minProperties' in this._schema && typeof this._schema.minProperties === 'number') {
            return this._schema.minProperties
        }
        if ('minItems' in this._schema && typeof this._schema.minItems === 'number') {
            return this._schema.minItems
        }
        if ('minimum' in this._schema && typeof this._schema.minimum === 'number') {
            return this._schema.minimum
        }
        if ('minLength' in this._schema && typeof this._schema.minLength === 'number') {
            return this._schema.minLength
        }
        return
    }
    getMax(): number | undefined {
        if ('maxProperties' in this._schema && typeof this._schema.maxProperties === 'number') {
            return this._schema.maxProperties
        }
        if ('maxItems' in this._schema && typeof this._schema.maxItems === 'number') {
            return this._schema.maxItems
        }
        if ('maximum' in this._schema && typeof this._schema.maximum === 'number') {
            return this._schema.maximum
        }
        if ('maxLength' in this._schema && typeof this._schema.maxLength === 'number') {
            return this._schema.maxLength
        }
        return
    }
    getUnit(): string {
        const unit: unknown = this.getMeta('unit')
        if (typeof unit === 'string') {
            return unit
        }
        return ''
    }
}

/**
 * Valibot helper for \@novice1/api-doc-generator
 */
export class OpenAPIValibotHelper extends BaseValibotHelper implements OpenAPIHelperInterface, KaapiOpenAPIHelperInterface {
    isFile(): boolean | undefined {
        const children = this.getChildren()
        const schema = children._data?.getRawSchema()
        return schema?.kind === 'schema' && schema.type === 'instance' && schema.expects === 'Buffer'
    }

    getRawSchema() {
        return this._valibotSchema
    }

    getFilesChildren(): Record<string, unknown> {
        const r: Record<string, ObjectEntries[string]> = {};
        const schema = this._schema
        const vSchema = this._valibotSchema
        if (vSchema && 'entries' in vSchema && typeof vSchema.entries === 'object' && vSchema.entries) {
            const properties: Record<string, unknown> = vSchema.entries as Record<string, unknown>
            for (const p in properties) {
                const isRequired: boolean = 'required' in schema && Array.isArray(schema.required) && schema.required.includes(p)
                const ch = new OpenAPIValibotHelper({ value: properties[p] }, isRequired)
                if (ch.isValid() && ch.isFile())
                    r[p] = ch.getRawSchema() as ObjectEntries[string]
            }
        }
        const files = object(r)
        return files as unknown as Record<string, unknown>;
    }


    getFirstItem(): OpenAPIValibotHelper | undefined {

        const schema = this._schema

        if ('items' in schema && typeof schema.items === 'object') {
            return new OpenAPIValibotHelper({ value: schema.items })
        }

        return
    }
    getChildren(): Record<string, OpenAPIValibotHelper> {
        const r: Record<string, OpenAPIValibotHelper> = {};
        const schema = this._schema
        const vSchema = this._valibotSchema
        if (vSchema && 'entries' in vSchema && typeof vSchema.entries === 'object' && vSchema.entries) {
            const properties: Record<string, unknown> = vSchema.entries as Record<string, unknown>
            for (const p in properties) {
                const isRequired: boolean = 'required' in schema && Array.isArray(schema.required) && schema.required.includes(p)
                r[p] = new OpenAPIValibotHelper({ value: properties[p] }, isRequired)
            }
        }
        return r;
    }
    getAlternatives(): OpenAPIValibotHelper[] {
        const r: OpenAPIValibotHelper[] = []
        const schema = this._schema
        if ('oneOf' in schema && Array.isArray(schema.oneOf)) {
            for (const p of schema.oneOf) {
                r.push(new OpenAPIValibotHelper({ value: p }))
            }
        }
        return r
    }
    hasStyle(): boolean {
        return typeof this.getMeta('style') === 'string'
    }
    getStyle(): string {
        const style = this.getMeta('style')
        if (typeof style === 'string') {
            return style
        }
        return ''
    }
    hasAdditionalProperties(): boolean {
        const schema = this._schema
        return !!('additionalProperties' in schema && schema.additionalProperties)
    }
    getAdditionalProperties(): AdditionalProperties {
        const schema = this._schema
        return 'additionalProperties' in schema && (schema.additionalProperties as AdditionalProperties)
    }
    hasRef(): boolean {
        const schema = this._schema
        return !!('$ref' in schema && typeof schema.$ref === 'string') || !!('$id' in schema && typeof schema.$id === 'string')
    }
    getRef(): string | undefined {
        const schema = this._schema
        return '$ref' in schema && typeof schema.$ref === 'string' ? schema.$ref :
            '$id' in schema && typeof schema.$id === 'string' ? schema.$id : undefined
    }
    hasDiscriminator(): boolean {
        const discriminator = this.getMeta('discriminator')
        return !!(discriminator &&
            typeof discriminator === 'object' &&
            'propertyName' in discriminator &&
            discriminator.propertyName &&
            typeof discriminator.propertyName === 'string')
    }
    getDiscriminator(): DiscriminatorObject | undefined {
        const discriminator = this.getMeta('discriminator')
        return discriminator &&
            typeof discriminator === 'object' &&
            'propertyName' in discriminator &&
            discriminator.propertyName &&
            discriminator.propertyName === 'string' ?
            (discriminator as DiscriminatorObject) :
            undefined
    }
    hasXml(): boolean {
        const xmlMeta = this.getMeta('xml')
        return !!(xmlMeta && typeof xmlMeta === 'object')
    }
    getXml(): XMLObject | undefined {
        return this.getMeta('xml') as XMLObject | undefined
    }
    hasExamples(): boolean {
        const schema = this._schema
        return !!('examples' in schema && Array.isArray(schema.examples))
    }
    getExamples(): Record<string, ExampleObject | ReferenceObject> | undefined {
        const schema = this._schema
        if ('examples' in schema && Array.isArray(schema.examples)) {
            const r: Record<string, ExampleObject | ReferenceObject> = {};
            let i = 1
            for (const value of schema.examples) {
                r[`${i}`] = {
                    value
                }
                i++
            }
            return r
        }
        return
    }
    hasEncoding(): boolean {
        const encodingMeta = this.getMeta('encoding')
        return !!(encodingMeta && typeof encodingMeta === 'object')
    }
    getEncoding(): Record<string, EncodingObject> | undefined {
        return this.getMeta('encoding') as Record<string, EncodingObject> | undefined
    }

}

/**
 * Valibot helper for \@novice1/api-doc-generator
 */
export class PostmanValibotHelper extends BaseValibotHelper implements PostmanHelperInterface {

    getFirstItem(): PostmanValibotHelper | undefined {

        const schema = this._schema

        if ('items' in schema && typeof schema.items === 'object') {
            return new PostmanValibotHelper({ value: schema.items })
        }

        return
    }
    getChildren(): Record<string, PostmanValibotHelper> {
        const r: Record<string, PostmanValibotHelper> = {};
        const schema = this._schema
        if ('properties' in schema && typeof schema.properties === 'object' && schema.properties) {
            const properties: Record<string, unknown> = schema.properties as Record<string, unknown>
            for (const p in properties) {
                const isRequired: boolean = 'required' in schema && Array.isArray(schema.required) && schema.required.includes(p)
                r[p] = new PostmanValibotHelper({ value: properties[p] }, isRequired)
            }
        }
        return r;
    }
    getAlternatives(): PostmanValibotHelper[] {
        const r: PostmanValibotHelper[] = []
        const schema = this._schema
        if ('oneOf' in schema && Array.isArray(schema.oneOf)) {
            for (const p of schema.oneOf) {
                r.push(new PostmanValibotHelper({ value: p }))
            }
        }
        return r
    }

    hasContentType(): boolean {
        return typeof this.getMeta('contentType') === 'string'
    }

    getContentType(): string | undefined {
        const contentType = this.getMeta('contentType')
        if (typeof contentType === 'string') {
            return contentType
        }
        return
    }

    hasDescriptionType(): boolean {
        return typeof this.getMeta('descriptionType') === 'string'
    }

    getDescriptionType(): string | undefined {
        const descriptionType = this.getMeta('descriptionType')
        if (typeof descriptionType === 'string') {
            return descriptionType
        }
        return
    }

    hasXml(): boolean {
        const xmlMeta = this.getMeta('xml')
        return !!(xmlMeta && typeof xmlMeta === 'object')
    }
    getXml(): XMLObject | undefined {
        return this.getMeta('xml') as XMLObject | undefined
    }
}