import type { z } from './schema';

class APIError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'APIError';
    this.status = status;
  }
}

/** User-facing messages for each way a JSON request can fail. */
type FailureMessages = {
  http: string;
  unreadable: string;
  invalid: string;
};

/** GETs a JSON endpoint and validates the payload against its schema. */
export async function fetchJSON<T>(
  path: string,
  schema: z.ZodType<T>,
  messages: FailureMessages,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) {
    throw new APIError(messages.http, response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error: unknown) {
    throw new APIError(messages.unreadable, response.status, { cause: error });
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new APIError(messages.invalid, response.status, { cause: result.error });
  }
  return result.data;
}
