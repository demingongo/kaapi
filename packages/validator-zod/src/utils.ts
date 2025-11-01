import { $ZodIssue } from 'zod/v4/core';

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#identifiers
 */
const identifierRegex = /[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*/u;

/**
 * @see https://github.com/causaly/zod-validation-error/blob/main/lib/utils/joinPath.ts
 */
function joinPath(path: PropertyKey[]): string {
    if (path.length === 1) {
        const propertyKey = path[0];

        let propertyKeyString = ''

        if (typeof propertyKey === 'symbol') {
            propertyKeyString = propertyKey.description ?? '';
        } else {
            propertyKeyString = String(propertyKey)
        }

        return propertyKeyString || '""';
    }

    return path.reduce<string>((acc, propertyKey) => {
        let propertyKeyString = ''

        // handle numeric indices
        if (typeof propertyKey === 'number') {
            return acc + '[' + propertyKey.toString() + ']';
        }

        // handle symbols
        if (typeof propertyKey === 'symbol') {
            propertyKeyString = propertyKey.description ?? '';
        } else {
            propertyKeyString = propertyKey
        }

        // handle quoted values
        if (propertyKeyString.includes('"')) {
            return acc + '["' + propertyKeyString.replace(/"/g, '\\"') + '"]';
        }

        // handle special characters
        if (!identifierRegex.test(propertyKeyString)) {
            return acc + '["' + propertyKeyString + '"]';
        }

        // handle normal values
        const separator = acc.length === 0 ? '' : '.';
        return acc + separator + propertyKeyString;
    }, '');
}

/**
 * @see https://github.com/causaly/zod-validation-error/blob/main/lib/v4/MessageBuilder.ts
 */
export function mapIssue(
    issue: $ZodIssue
): string {
    if (issue.code === 'invalid_union' && issue.errors.length !== 0) {
        const individualMessages = issue.errors.map((issues) =>
            issues
                .map((subIssue) =>
                    mapIssue(
                        {
                            ...subIssue,
                            path: issue.path.concat(subIssue.path),
                        }
                    )
                )
                .join('; ')
        );

        // deduplicate messages
        // and join them with the union separator
        // to create a single message for the invalid union issue
        return Array.from(new Set(individualMessages)).join(' or ');
    }

    const buf = [];

    buf.push(
        issue.message.length === 0 ? issue.message : issue.message.charAt(0).toUpperCase() + issue.message.slice(1)
    );

    pathCondition: if (
        issue.path !== undefined &&
        issue.path.length !== 0
    ) {
        // handle array indices
        if (issue.path.length === 1) {
            const identifier = issue.path[0];

            if (typeof identifier === 'number') {
                buf.push(` at index ${identifier}`);
                break pathCondition;
            }
        }

        buf.push(` at "${joinPath(issue.path)}"`);
    }

    return buf.join('');
}