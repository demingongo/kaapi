import fs from 'node:fs'
import { fileURLToPath } from 'node:url';
import path, { dirname } from 'node:path'

async function copyDtsFiles(src, dest) {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src, { withFileTypes: true })

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)

        if (entry.isDirectory()) {
            await copyDtsFiles(srcPath, destPath);
        } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
            await fs.promises.copyFile(srcPath, destPath)
            console.log(`Copied: ${srcPath} → ${destPath}`)
        }
    }
}

async function buildDT() {
    console.log('scripts/buildDT')

    await copyDtsFiles(
        `${dirname(fileURLToPath(import.meta.url))}/../src`,
        `${dirname(fileURLToPath(import.meta.url))}/../lib`
    )

    const destFilePath = `${dirname(fileURLToPath(import.meta.url))}/../lib/index.d.ts`

    console.log(`destination = ${destFilePath}`)

    let content = await fs.promises.readFile(destFilePath, { encoding: 'utf-8' })

    content = `import './declarations.d.ts'
` + content

    await fs.promises.writeFile(destFilePath, content, { encoding: 'utf-8' })

    console.log('Done')
}

buildDT()