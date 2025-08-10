import { MultiSelectOptions, SelectOptions, TextOptions } from '@clack/prompts'
import { Argv } from 'mri'

export enum QuestionType {
    text = 'text',
    select = 'select',
    multiselect = 'multiselect'
}

export type Question<Value extends Readonly<string | boolean | number> = Readonly<string | boolean | number>> = {
    type: QuestionType.select | 'select'
    options: SelectOptions<Value>
    setValue(value: Value): void
} |
{
    type: QuestionType.multiselect | 'multiselect'
    options: MultiSelectOptions<Value>
    setValue(value: Value[]): void
} | 
{
    type: QuestionType.text | 'text'
    options: TextOptions
    setValue(value: string): void
}


export type FileGeneratorType = 'plugin' | 'auth-design'

export interface FileGenerator {
    name: string
    type: FileGeneratorType

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    init(options: Record<string, any>): void
    isValid(): boolean
    getFileContent(): string

    getQuestions?(): Question[]
}

export interface Config {
    generators?: FileGenerator[]
}

export interface CmdContext {
    config: Config
    cwd: string
    cancel: () => void
    error: (code: number, message: string) => void
} 

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CmdAction<T=Record<string, any>> {
    (argv: Argv<T>, opts: CmdContext): void | Promise<void>
}

