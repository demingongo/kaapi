import fs from 'node:fs'
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path'

async function buildDT() {
    console.log('scripts/buildDT')

    const destFilePath = `${dirname(fileURLToPath(import.meta.url))}/../lib/index.d.ts`

    console.log(`destination = ${destFilePath}`)

    let content = await fs.promises.readFile(destFilePath, { encoding: 'utf-8' })

    content = `import '../types/overrides.d.ts'
` + content

    await fs.promises.writeFile(destFilePath, content, { encoding: 'utf-8' })

    console.log('Done')
}

buildDT()