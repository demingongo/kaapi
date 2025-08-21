import _camelCase from 'lodash/camelCase'
import _kebabCase from 'lodash/kebabCase'
import _snakeCase from 'lodash/snakeCase'
import fs from 'node:fs/promises'
import nodePath from 'node:path'

export const camelCase = _camelCase
export const kebabCase = _kebabCase
export const snakeCase = _snakeCase

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
export function isValidFilename(input: string) {
  const regex = /^(?=[a-zA-Z0-9._-]{4,}$)(?=.*\.)[a-zA-Z0-9_-]*\.[a-zA-Z]+$/;
  return regex.test(input);
}

export async function isKaapiProjectRoot(path: string): Promise<boolean> {
  try {
    const pkgPath = nodePath.join(path, 'package.json')

    //await fs.access(pkgPath);
    const pkgContent = await fs.readFile(pkgPath)
    const pkg = JSON.parse(Buffer.from(pkgContent).toString('utf-8'))
    
    if(typeof pkg?.dependencies?.['@kaapi/kaapi'] != 'string') {
        return false
    }

    return true;
  } catch {
    return false;
  }
}