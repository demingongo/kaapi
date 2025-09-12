import type { AuthCodeGeneratorResult } from './authorization-route'

type ExtractByType<R extends AuthCodeGeneratorResult, T extends R['type']> =
  Extract<R, { type: T }>;

function isCode(r: AuthCodeGeneratorResult): r is { type: 'code'; value: string } {
  return r.type === 'code';
}

function isContinue<Value = unknown>(r: AuthCodeGeneratorResult): r is { type: 'continue'; value?: Value } {
  return r.type === 'continue';
}

function isDeny<Value = unknown>(r: AuthCodeGeneratorResult): r is { type: 'deny'; value?: Value } {
  return r.type === 'deny';
}

export const AuthCodeResult = Object.freeze({
  /**
   * Check if result is a 'code' result
   */
  isCode,
  /**
   * Check if result is a 'continue' result
   */
  isContinue,
  /**
   * Check if result is a 'deny' result
   */
  isDeny,
});

export type AuthCodeResultMatchHandlers<
  Continue = unknown,
  Deny = unknown,
  Return = unknown
> = {
  code: (value: string) => Return;
  continue: (value?: Continue) => Return;
  deny: (value?: Deny) => Return;
};

export function matchAuthCodeResult<
  Continue = unknown,
  Deny = unknown,
  Return = unknown
>(
  result: AuthCodeGeneratorResult,
  handlers: AuthCodeResultMatchHandlers<Continue, Deny, Return>
): Return {
  switch (result.type) {
    case 'code':
      return handlers.code(result.value);
    case 'continue':
      return handlers.continue((result as ExtractByType<typeof result, 'continue'>).value as Continue);
    case 'deny':
      return handlers.deny((result as ExtractByType<typeof result, 'deny'>).value as Deny);
  }
}

export function createMatchAuthCodeResult<
  Continue,
  Deny,
  Return
>(
  handlers: AuthCodeResultMatchHandlers<Continue, Deny, Return>
) {
  return (result: AuthCodeGeneratorResult): Return => {
    return matchAuthCodeResult(result, handlers);
  };
}
