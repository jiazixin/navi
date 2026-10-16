import { z } from './schema';

// Go counts Unicode code points, not UTF-16 code units.
function textSchema(minimum: number, maximum: number) {
  return z.string().refine((value) => {
    const length = Array.from(value).length;
    return length >= minimum && length <= maximum;
  }, `Expected ${minimum} to ${maximum} characters.`);
}

const httpURLSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Only http and https URLs are supported.');

const catalogLinkSchema = z
  .object({
    runtimeId: z.string().min(1),
    name: textSchema(1, 60),
    description: textSchema(0, 120).optional(),
    privateUrl: httpURLSchema.optional(),
    publicUrl: httpURLSchema.optional(),
    tags: z.array(textSchema(1, 24)).max(10).default([]),
  })
  .strict()
  .refine((link) => link.privateUrl !== undefined || link.publicUrl !== undefined, {
    message: 'A catalog link must include privateUrl or publicUrl.',
  });

const catalogGroupSchema = z
  .object({
    name: textSchema(1, 40),
    links: z.array(catalogLinkSchema),
  })
  .strict();

const catalogPageSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
    title: textSchema(1, 40),
    subtitle: textSchema(0, 100).optional(),
    groups: z.array(catalogGroupSchema),
  })
  .strict();

export const catalogSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    pages: z
      .array(catalogPageSchema)
      .min(1)
      .max(20)
      .refine((pages) => new Set(pages.map((page) => page.id)).size === pages.length, {
        message: 'Catalog page IDs must be unique.',
      }),
  })
  .strict();

export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogPage = Catalog['pages'][number];
export type CatalogGroup = CatalogPage['groups'][number];
export type CatalogLink = CatalogGroup['links'][number];

export class APIError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'APIError';
    this.status = status;
  }
}

async function decodeResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw new APIError('请求暂时无法完成。', response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error: unknown) {
    throw new APIError('服务返回了无法读取的数据。', response.status, { cause: error });
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new APIError('服务返回的数据不符合目录协议。', response.status, {
      cause: result.error,
    });
  }

  return result.data;
}

export async function getCatalog(signal?: AbortSignal): Promise<Catalog> {
  const requestInit: RequestInit = {
    headers: { Accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  };
  const response = await fetch('/api/catalog', requestInit);

  return decodeResponse(response, catalogSchema);
}
