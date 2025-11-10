import { OpenAPIHelperClass, OpenAPIHelperInterface, PostmanHelperClass, PostmanHelperInterface } from '@novice1/api-doc-generator';
import { OpenAPIJoiHelper } from '@novice1/api-doc-generator/lib/generators/openapi/helpers/joiHelper';
import { PostmanJoiHelper } from '@novice1/api-doc-generator/lib/generators/postman/helpers/joiHelper';

export abstract class DelegatingHelper<T> {
    protected helper: T;

    constructor(
        args: { isRoot?: boolean; value: unknown },
        defaultHelper: new (args: { isRoot?: boolean; value: unknown }) => T,
        fallbackHelpers: Set<new (args: { isRoot?: boolean; value: unknown }) => T>,
        isValid: (helper: T) => boolean
    ) {
        this.helper = new defaultHelper({ ...args });

        if (!isValid(this.helper)) {
            for (const HelperClass of fallbackHelpers) {
                const candidate = new HelperClass({ ...args });
                if (isValid(candidate)) {
                    this.helper = candidate;
                    break;
                }
            }
        }
    }
}

export class OpenAPIMixHelper extends DelegatingHelper<OpenAPIHelperInterface> implements OpenAPIHelperInterface {
    static helperClasses: Set<OpenAPIHelperClass> = new Set<OpenAPIHelperClass>();

    constructor(args: { isRoot?: boolean; value: unknown }) {
        super(args, OpenAPIJoiHelper, OpenAPIMixHelper.helperClasses, h => h.isValid());
        /*
        console.log('==>', Object.getPrototypeOf(this.helper).constructor.name)
        if (Object.getPrototypeOf(this.helper).constructor.name === '_OpenAPIArkHelper') {
            console.log('===>', args)
        }
        */
    }

    getFirstItem() { return this.helper.getFirstItem(); }
    getChildren() { return this.helper.getChildren(); }
    getAlternatives() { return this.helper.getAlternatives(); }
    hasStyle?() { return this.helper.hasStyle?.() || false; }
    getStyle?() { return this.helper.getStyle?.(); }
    hasAdditionalProperties?() { return this.helper.hasAdditionalProperties?.() || false; }
    getAdditionalProperties?() { return this.helper.getAdditionalProperties?.(); }
    hasRef?() { return this.helper.hasRef?.() || false; }
    getRef?() { return this.helper.getRef?.(); }
    hasDiscriminator?() { return this.helper.hasDiscriminator?.() || false; }
    getDiscriminator?() { return this.helper.getDiscriminator?.(); }
    hasXml?() { return this.helper.hasXml?.() || false; }
    getXml?() { return this.helper.getXml?.(); }
    hasExamples?() { return this.helper.hasExamples?.() || false; }
    getExamples?() { return this.helper.getExamples?.(); }
    hasEncoding?() { return this.helper.hasEncoding?.() || false; }
    getEncoding?() { return this.helper.getEncoding?.(); }
    isValid() { return this.helper.isValid(); }
    getType() { return this.helper.getType(); }
    getDescription() { return this.helper.getDescription(); }
    isRequired() { return this.helper.isRequired(); }
    isUnique() { return this.helper.isUnique(); }
    hasDefaultValue() { return this.helper.hasDefaultValue(); }
    getDefaultValue() { return this.helper.getDefaultValue(); }
    hasExampleValue() { return this.helper.hasExampleValue(); }
    getExampleValue() { return this.helper.getExampleValue(); }
    isDeprecated() { return this.helper.isDeprecated(); }
    allowsEmptyValue() { return this.helper.allowsEmptyValue(); }
    getEnum() { return this.helper.getEnum(); }
    hasMin() { return this.helper.hasMin(); }
    hasMax() { return this.helper.hasMax(); }
    getMin() { return this.helper.getMin(); }
    getMax() { return this.helper.getMax(); }
    getUnit() { return this.helper.getUnit(); }
}

export class PostmanMixHelper extends DelegatingHelper<PostmanHelperInterface> implements PostmanHelperInterface {
    static helperClasses: Set<PostmanHelperClass> = new Set<PostmanHelperClass>();

    constructor(args: { isRoot?: boolean; value: unknown }) {
        super(args, PostmanJoiHelper, PostmanMixHelper.helperClasses, h => h.isValid());
    }

    getFirstItem() { return this.helper.getFirstItem(); }
    getChildren() { return this.helper.getChildren(); }
    getAlternatives() { return this.helper.getAlternatives(); }
    hasContentType?() { return this.helper.hasContentType?.() || false; }
    getContentType?() { return this.helper.getContentType?.(); }
    hasDescriptionType?() { return this.helper.hasDescriptionType?.() || false; }
    getDescriptionType?() { return this.helper.getDescriptionType?.(); }
    hasXml?() { return this.helper.hasXml?.() || false; }
    getXml?() { return this.helper.getXml?.(); }
    isValid() { return this.helper.isValid(); }
    getType() { return this.helper.getType(); }
    getDescription() { return this.helper.getDescription(); }
    isRequired() { return this.helper.isRequired(); }
    isUnique() { return this.helper.isUnique(); }
    hasDefaultValue() { return this.helper.hasDefaultValue(); }
    getDefaultValue() { return this.helper.getDefaultValue(); }
    hasExampleValue() { return this.helper.hasExampleValue(); }
    getExampleValue() { return this.helper.getExampleValue(); }
    isDeprecated() { return this.helper.isDeprecated(); }
    allowsEmptyValue() { return this.helper.allowsEmptyValue(); }
    getEnum() { return this.helper.getEnum(); }
    hasMin() { return this.helper.hasMin(); }
    hasMax() { return this.helper.hasMax(); }
    getMin() { return this.helper.getMin(); }
    getMax() { return this.helper.getMax(); }
    getUnit() { return this.helper.getUnit(); }
}
