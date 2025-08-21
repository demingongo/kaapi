import * as prompts from '@clack/prompts';
import fs from 'node:fs/promises'
import { CmdAction, FileGenerator, FileGeneratorType, QuestionType } from '../definitions';
import { pluginGenerator } from './generators/plugin';
import { isKaapiProjectRoot, isValidFilename, kebabCase } from '../utils';

const FILE_TYPES: Record<FileGeneratorType, string> = {
    'auth-design': 'Auth Design',
    plugin: 'Plugin'
}

function createHelpMessage(action: string, fileGenerator?: FileGenerator, generatorOptions?: Record<string, string>): string {

    const defaultDescription = 'Interactive CLI to generate files.'

    let optionsString = ''

    if (generatorOptions && Object.keys(generatorOptions).length) {
        const longestOptionLength = (Object.keys(generatorOptions).map(k => k.length).sort((a, b) => b - a)[0] || 1)

        for (const p in generatorOptions) {
            optionsString += `    --${p.padEnd(longestOptionLength, ' ')}          ${generatorOptions[p]} 
`
        }
    }

    let defaultHelp = `\
  
  Usage: kaapi ${action} [OPTION]...
  
  ${defaultDescription}
  
  Options:
    --generator NAME          use a generator
    --type TYPE               type of generator
    --list                    list generators

  Available types:
  auth-design
  plugin
`

    if (fileGenerator) {
        defaultHelp = `\
  
  Usage: kaapi ${action} --generator ${fileGenerator.name} [OPTION]...
  
  ${fileGenerator.description || defaultDescription}
  
  Options:
${optionsString}
`
    }

    return defaultHelp
}

function cleanupOptionsDefinition(defOptions?: Record<string, string>) {
    const options: Record<string, string> = {}

    if (defOptions) {
        for (const k in defOptions) {
            if (!['_', 'generator', 'help', 'list', 'type'].includes(k)) options[k] = defOptions[k]
        }
    }

    return options
}

async function doContinue(cwd: string): Promise<boolean> {
    prompts.log.info('action: generate')

    if (!await isKaapiProjectRoot(cwd)) {
        const isOk = await prompts.select({
            message: 'Current working directory is not the root of a kaapi project, continue?',
            options: [{
                label: 'yes',
                value: 'y',
            },
            {
                label: 'No',
                value: 'n',
            }],
            initialValue: 'n'
        })
        if (prompts.isCancel(isOk) || isOk == 'n') return false
    }

    return true
}

export default (async function generate(argv, { cancel, config, error, cwd, action }) {

    let generators: FileGenerator[] = [
        pluginGenerator
    ]

    generators = generators.concat(config.generators?.map(g => g) || [])

    let filterType: FileGeneratorType | undefined = typeof argv.type === 'string' ? argv.type : undefined

    let fileGeneratorName: string = typeof argv.generator === 'string' ? argv.generator : '';
    let fileGenerator: FileGenerator | undefined;

    const { _: _c, generator: _g, type: _t, list: _l, help: _h, ...initOptions } = argv

    if (!generators.length) {
        return error(2, `No generator was found ${filterType ? `(type: ${filterType})` : ''}`)
    }

    if (!fileGeneratorName && argv.help) {
        console.log(createHelpMessage(action))
        return
    }

    if (!fileGeneratorName) {
        if (!(await doContinue(cwd))) return cancel()

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
        if (fileGenerator && argv.help) {
            console.log(createHelpMessage(action, fileGenerator, cleanupOptionsDefinition(fileGenerator.options)))
            return 
        }

        if (!(await doContinue(cwd))) return cancel()
    }

    if (!fileGenerator) {
        return error(2, `No generator was found ${fileGeneratorName ? `(name: ${fileGeneratorName})` : ''}`)
    }

    const defOptions = cleanupOptionsDefinition(fileGenerator.options || {})
    const gOptions: Record<string, unknown> = {}

    for (const k in defOptions) {
        if (typeof initOptions[k] != 'undefined') gOptions[k] = initOptions[k]
    }

    fileGenerator.init(gOptions)

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

    if (!content) {
        return error(2, `No content (generator: ${fileGeneratorName})`)
    }

    let filename = fileGenerator.getFilename?.()

    if (filename) {
        if (!isValidFilename(filename)) {
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
        return error(2, `Invalid filename: ${r}`)
    }

    const target = `plugins/${filename}`
    try {
        await fs.access(target)
        const isOk = await prompts.select({
            message: `File ${target} already exists, overwrite?`,
            options: [{
                label: 'yes',
                value: 'y',
            },
            {
                label: 'No',
                value: 'n',
            }],
            initialValue: 'n'
        })
        if (prompts.isCancel(isOk) || isOk == 'n') return cancel()
    } catch (_err) {
        //
    }
    const spinner = prompts.spinner({ indicator: 'dots' })
    spinner.start(`Creating ${target}`)
    try {
        await fs.mkdir('plugins', { recursive: true })
    } catch (_err) {
        //
    }
    await fs.writeFile(`${target}`, content)
    spinner.stop(`Created plugins/${filename}`)

}) as CmdAction<{ type?: 'plugin' | 'auth-design', generator?: string, list?: boolean, help?: boolean, [key: string]: unknown }>