import { camelCase } from 'lodash';
import { FileGenerator, Question, QuestionType } from '../../definitions';

export type PluginFileGenerator = FileGenerator & {
    pluginName: string
}

export const pluginGenerator: PluginFileGenerator = {
    name: 'kaapi-plugin',
    type: 'plugin',

    pluginName: '',

    init: function (options: Record<string, unknown>): void {
        if (typeof options['plugin-name'] == 'string') {
            this.pluginName = camelCase(options['plugin-name'])
        }
    },
    getFileContent: function (): string {
        return `
import { KaapiPlugin, KaapiTools } from '@kaapi/kaapi'

export const ${this.pluginName}: KaapiPlugin = {
    integrate: function (_t: KaapiTools): void | Promise<void> {
        // write your code here
    }
}
`
    },
    isValid() {
        return !!this.pluginName
    },
    getQuestions() {
        const r: Question[] = []

        if (!this.pluginName) {
            r.push({
                type: QuestionType.text,
                options: {
                    message: 'The name of the plugin?',
                    defaultValue: 'customPlugin',
                    placeholder: 'customPlugin'
                },
                setValue: (pluginName) => {
                    this.pluginName = camelCase(pluginName)
                }
            })
        }

        return r
    },
}