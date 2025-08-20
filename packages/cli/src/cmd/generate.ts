import * as prompts from '@clack/prompts';
import { CmdAction, FileGenerator, FileGeneratorType, QuestionType } from '../definitions';
import { pluginGenerator } from './generators/plugin';
import { kebabCase } from '../utils';

const FILE_TYPES: Record<FileGeneratorType, string> = {
    'auth-design': 'Auth Design',
    plugin: 'Plugin'
}

/**
 * Allows only:
 * - Letters (a-z, A-Z)
 * - Numbers (0-9)
 * - Dashes (-)
 * - Underscores (_)
 * - Dots (.)
 * 
 * Enforces:
 * - Minimum 4 characters
 * - At least one dot (.)
 * - At least one letter after the last dot
 */
function isValidFilename(input: string) {
  const regex = /^(?=[a-zA-Z0-9._-]{4,}$)(?=.*\.)[a-zA-Z0-9_-]*\.[a-zA-Z]+$/;
  return regex.test(input);
}

export default (async function generate(argv, { cancel, config, error }) {
    prompts.log.info('generate ...')

    let generators: FileGenerator[] = [
        pluginGenerator
    ]

    generators = generators.concat(config.generators?.map(g => g) || [])

    let filterType: FileGeneratorType | undefined = typeof argv.type === 'string' ? argv.type : undefined

    let fileGeneratorName: string = typeof argv.generator === 'string' ? argv.generator : '';
    let fileGenerator: FileGenerator | undefined;

    if (!generators.length) {
        return error(2, `No generator was found ${filterType ? `(type: ${filterType})` : ''}`)
    }

    if (!fileGeneratorName) {
        if (filterType) {
            if (Object.keys(FILE_TYPES).includes(filterType)) {
                generators = generators.filter(g => g.type == filterType) || []
            } else {
                return error(1, `Unknown type "${filterType}"`)
            }
        } else {
            const availables: Record<FileGeneratorType, boolean> = {
                'auth-design': false,
                plugin: false
            }
            let nbGeneratorTypes = 0
            let lastGeneratorType: FileGeneratorType | undefined = undefined

            generators.forEach(
                g => {
                    if (availables[g.type] === false) {
                        availables[g.type] = true;
                        nbGeneratorTypes++;
                        lastGeneratorType = g.type;
                    }
                }
            );

            if (!nbGeneratorTypes) error(2, 'No generator type was found')

            if (nbGeneratorTypes === 1 && lastGeneratorType) {
                filterType = lastGeneratorType
            } else {
                const filterTypeChoice = await prompts.select({
                    message: 'Select a type:',
                    options: Object.keys(availables).filter(v => availables[v as FileGeneratorType]).map((value) => {
                        return {
                            label: FILE_TYPES[value as FileGeneratorType],
                            value: value as FileGeneratorType,
                        }
                    }),
                })
                if (prompts.isCancel(filterTypeChoice)) return cancel()

                filterType = filterTypeChoice
            }

            generators = generators.filter(g => g.type == filterType) || []
        }

        if (!generators.length) {
            return error(2, `No generator was found ${filterType ? `(type: ${filterType})` : ''}`)
        }

        const fileGeneratorChoice = await prompts.select({
            message: 'Select a generator:',
            options: generators.map((g) => {
                return {
                    label: g.name,
                    value: g,
                }
            }),
        })

        if (prompts.isCancel(fileGeneratorChoice)) return cancel()

        fileGenerator = fileGeneratorChoice

        fileGeneratorName = fileGenerator.name
    } else {
        fileGenerator = generators.filter(g => g.name == fileGeneratorName)[0]
    }

    if (!fileGenerator) {
        return error(2, `No generator was found ${fileGeneratorName ? `(name: ${fileGeneratorName})` : ''}`)
    }

    fileGenerator.init(argv)

    const questions = fileGenerator.getQuestions?.() || []

    for (const q of questions) {
        if (q.type === QuestionType.text) {
            const r = await prompts.text(q.options)
            if (prompts.isCancel(r)) return cancel()
            q.setValue(r)
        } else if (q.type === QuestionType.select) {
            const r = await prompts.select(q.options)
            if (prompts.isCancel(r)) return cancel()
            q.setValue(r)
        } else if (q.type === QuestionType.multiselect) {
            const r = await prompts.multiselect(q.options)
            if (prompts.isCancel(r)) return cancel()
            q.setValue(r)
        }
    }

    if (!fileGenerator.isValid()) {
        return error(2, `Invalid options (generator: ${fileGeneratorName})`)
    }

    const content = fileGenerator.getFileContent()

    if (content) {
        prompts.log.success(content)
    }

    let filename = fileGenerator.getFilename?.()
    
    if (filename) {
        if(!isValidFilename(filename)) {
            prompts.log.error(`Invalid filename: ${filename}`)
            filename = kebabCase(filterType) + '.ts'
        }
    } else {
        filename = kebabCase(filterType) + '.ts'
    }
    
    const r = await prompts.text({
        message: 'The name of the file?',
        defaultValue: `${filename}`,
        placeholder: `${filename}`
    })
    if (prompts.isCancel(r)) return cancel()

    if (isValidFilename(r)) {
        filename = r
    } else {
        return error(2, `Invalid filename: ${filename}`)
    }

    prompts.log.warn(`TODO: create file ${filename}`)

}) as CmdAction<{ type?: 'plugin' | 'auth-design', generator?: string, class?: string }>