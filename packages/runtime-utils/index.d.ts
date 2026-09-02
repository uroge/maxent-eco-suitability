export declare const withTimeout: <T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string
) => Promise<T>;

export declare const resolveRequestId: (incomingRequestId: string | undefined) => string;

export declare const constantTimeBearerTokenEquals: (
  authorization: string | undefined,
  expected: string
) => boolean;

export declare const loadLuaScript: (directory: string, filename: string) => string;
