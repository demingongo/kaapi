# `@kaapi/cli` — Package Reference

**npm**: `@kaapi/cli` · **version**: 0.0.42  
**Source**: `packages/cli/src/`  
**Build**: `tsc` → `lib/` · **Format**: CommonJS (`NodeNext`)  
**Binary**: `kaapi` (via `package.json` `bin` field)  
**Dependencies**: `@clack/prompts`, `lodash`, `mri`, `tslib`

**Entry points**:

- `.` → CLI binary (not useful to import directly)
- `@kaapi/cli/definitions` → types for building generators
- `@kaapi/cli/utils` → string utilities

---

## Purpose

An interactive command-line tool (`kaapi`) for scaffolding files in a Kaapi project. Reads a `kaapi.config.mjs` from the current working directory to discover user-defined and third-party code generators.

Also acts as a **library** that other Kaapi packages (e.g. `@kaapi/oauth2-auth-design`) import to register their own scaffold generators via `FileGenerator`.

---

## File Structure

```
src/
  index.ts                ← CLI entry point (#!/usr/bin/env node)
  definitions.ts          ← QuestionType, Question, FileGenerator, FileGeneratorType, Config, CmdContext, CmdAction
  load-config.ts          ← loadKaapiConfig() — loads kaapi.config.mjs / .js
  utils.ts                ← camelCase, kebabCase, snakeCase, isValidFilename, isKaapiProjectRoot
  cmd/
    index.ts              ← ALIASES { g → 'generate' }, CMDS { generate }
    generate.ts           ← interactive generate action
    generators/
      auth-design.ts      ← AuthDesignGenerator (built-in)
      generator.ts        ← kaapiGeneratorGenerator (built-in; scaffolds new generators)
      plugin.ts           ← pluginGenerator (built-in)
```

---

## CLI Usage

```bash
# Run generate command
kaapi generate
# or alias:
kaapi g

# The CLI will:
# 1. Check that CWD is a Kaapi project root (has @kaapi/kaapi in package.json)
# 2. Load kaapi.config.mjs (or .js) from CWD
# 3. Present @clack/prompts menus to choose generator and answer questions
# 4. Write the generated file
```

---

## `kaapi.config.mjs`

Create this file at the project root to register custom generators:

```js
// kaapi.config.mjs
import { MyCustomGenerator } from './scripts/my-generator.mjs';
import { OAuth2FlowGenerator } from '@kaapi/oauth2-auth-design/cli';

export default {
    generators: [new OAuth2FlowGenerator(), new MyCustomGenerator()],
};
```

Shape defined by `Config`:

```ts
interface Config {
    generators?: FileGenerator[];
}
```

---

## `FileGenerator` Interface

The core abstraction. Implement this to add a custom generator to the `kaapi generate` command.

```ts
import type { FileGenerator, FileGeneratorType, Question } from '@kaapi/cli/definitions';

export class MyPluginGenerator implements FileGenerator {
    readonly name = 'my-plugin';
    readonly type: FileGeneratorType = 'plugin'; // 'plugin' | 'auth-design' | 'others'
    readonly description = 'Scaffolds a custom Kaapi plugin';
    readonly notes = ['Remember to register your plugin via app.extend(plugin)'];

    private pluginName = '';

    init(options: Record<string, any>): void {
        this.pluginName = options.name ?? 'my-plugin';
    }

    isValid(): boolean {
        return this.pluginName.length > 0;
    }

    getFileContent(): string {
        return `
import { KaapiPlugin, KaapiTools } from '@kaapi/kaapi';

export class ${toPascalCase(this.pluginName)} implements KaapiPlugin {
    async integrate(t: KaapiTools): Promise<void> {
        // TODO: implement
    }
}
        `.trim();
    }

    getFilename?(): string {
        return `${this.pluginName}.plugin.ts`;
    }

    getQuestions?(): Question[] {
        return [
            {
                type: 'text',
                options: { message: 'Plugin name?' },
                setValue: (value) => {
                    this.pluginName = value;
                },
            },
        ];
    }
}
```

### `FileGenerator` Members

| Member             | Required | Description                                                      |
| ------------------ | -------- | ---------------------------------------------------------------- |
| `name`             | yes      | Unique generator identifier (shown in CLI menu)                  |
| `type`             | yes      | Category: `'plugin'`, `'auth-design'`, or `'others'`             |
| `description`      | no       | Short description shown in CLI menu                              |
| `notes`            | no       | Post-generation notes shown to user                              |
| `options`          | no       | Static string key-value options                                  |
| `init(options)`    | yes      | Called before generation; receives answers from `getQuestions()` |
| `isValid()`        | yes      | Returns `true` if generator has enough data to produce a file    |
| `getFileContent()` | yes      | Returns the file content as a string                             |
| `getFilename?()`   | no       | Returns the output filename (CLI prompts user if omitted)        |
| `getQuestions?()`  | no       | Returns interactive questions to ask before generation           |

---

## `Question` Type

Questions use `@clack/prompts` under the hood:

```ts
type Question =
    | {
          type: 'text' | QuestionType.text;
          options: TextOptions; // @clack/prompts TextOptions
          setValue(value: string): void;
          skip?(): boolean;
      }
    | {
          type: 'select' | QuestionType.select;
          options: SelectOptions<Value>; // @clack/prompts SelectOptions
          setValue(value: Value): void;
          skip?(): boolean;
      }
    | {
          type: 'multiselect' | QuestionType.multiselect;
          options: MultiSelectOptions<Value>;
          setValue(value: Value[]): void;
          skip?(): boolean;
      };

enum QuestionType {
    text = 'text',
    select = 'select',
    multiselect = 'multiselect',
}
```

`skip?()` — if returns `true`, the question is skipped (useful for conditional questions).

---

## `FileGeneratorType`

```ts
type FileGeneratorType = 'plugin' | 'auth-design' | 'others';
```

Used to group generators in the CLI menu.

---

## `@kaapi/cli/definitions` — Importable Types

```ts
import type {
    QuestionType,
    Question,
    FileGenerator,
    FileGeneratorType,
    Config,
    CmdContext,
    CmdAction,
} from '@kaapi/cli/definitions';
```

`CmdContext` and `CmdAction` are for building custom CLI commands (advanced use).

---

## `@kaapi/cli/utils` — String Utilities

```ts
import { camelCase, kebabCase, snakeCase, isValidFilename, isKaapiProjectRoot } from '@kaapi/cli/utils';

camelCase('my-plugin'); // 'myPlugin'
kebabCase('MyPlugin'); // 'my-plugin'
snakeCase('MyPlugin'); // 'my_plugin'
isValidFilename('my-file.ts'); // true
isKaapiProjectRoot('/path/to/project'); // true if package.json has @kaapi/kaapi dep
```

`isKaapiProjectRoot(cwd)` — checks that `package.json` in `cwd` exists and lists `@kaapi/kaapi` as a dependency or devDependency.

---

## Built-in Generators

The CLI ships three built-in generators (always available, regardless of `kaapi.config.mjs`):

| Generator                 | Type            | Description                           |
| ------------------------- | --------------- | ------------------------------------- |
| `AuthDesignGenerator`     | `'auth-design'` | Scaffolds a custom `AuthDesign` class |
| `pluginGenerator`         | `'plugin'`      | Scaffolds a basic `KaapiPlugin` class |
| `kaapiGeneratorGenerator` | `'others'`      | Scaffolds a new `FileGenerator` class |

---

## Project Root Detection

The CLI refuses to run outside a Kaapi project. It checks whether `package.json` in the current directory has `@kaapi/kaapi` in `dependencies` or `devDependencies`.
