import { CmdAction } from '../definitions'
import generateAction from './generate'

export const ALIASES: Record<string, string> = {
    g: 'generate'
}

export const CMDS: Record<string, CmdAction> = {
    generate: generateAction
}