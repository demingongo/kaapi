#! /usr/bin/env node

import * as prompts from '@clack/prompts';
import { loadKaapiConfig } from './load-config';
import pckg from '../package.json';
import mri from 'mri';

import {
    ALIASES,
    CMDS
} from './cmd'
import { CmdContext } from './definitions';

const argv = mri(process.argv.slice(2), {
    alias: { h: 'help' },
    boolean: ['help']
});

const cwd = process.cwd();

const cancel = () => {
    prompts.cancel('Operation cancelled')
    process.exit(130)
}

const error = (code: number, message: string) => {
    prompts.cancel(message)
    process.exit(code)
}

(async () => {
    if (!argv.help)
        prompts.intro(`${pckg.name} ${pckg.version}`)
    const config = await loadKaapiConfig(!!argv.help);
    //console.log('Loaded kaapi config:', config);

    const opts: CmdContext = {
        config,
        cwd,
        cancel,
        error,
        action: ''
    }

    let cmd = argv._[0]
        ? String(argv._[0])
        : ''

    if (!cmd) {

        if (argv.help) {
            // TODO: list actions
            return
        }

        const action = await prompts.select({
            message: 'What do you want to do?:',
            options: Object.keys(CMDS).map((label) => {
                return {
                    label,
                    value: CMDS[label],
                }
            }),
        });

        if (prompts.isCancel(action)) return cancel()

        if (action) {
            await action(argv, opts)
        }
    } else {
        cmd = ALIASES[cmd] || cmd
        const action = CMDS[cmd]
        if (action) {
            opts.action = cmd
            await action(argv, opts)
        }
    }

    if (!argv.help)
        prompts.outro('Operation ended')
})();