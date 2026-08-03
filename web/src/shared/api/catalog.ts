import { z } from 'zod';
import {
  catalogBackgroundPatternSchema,
  DEFAULT_BACKGROUND_PATTERN,
} from './backgroundPattern';
import { catalogThemeSchema } from './theme';
import { DEFAULT_WEB_SEARCH_PROVIDER, webSearchProviderSchema } from './webSearch';

const httpURLSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Only http and https URLs are supported.');

const catalogLinkSchema = z
  .object({
    runtimeId: z.string().min(1),
    name: z.string().min(1).max(60),
    description: z.string().max(120).optional(),
    privateUrl: httpURLSchema.optional(),
    publicUrl: httpURLSchema.optional(),
    tags: z.array(z.string().min(1).max(24)).max(10).default([]),
  })
  .strict()
  .refine((link) => link.privateUrl !== undefined || link.publicUrl !== undefined, {
    message: 'A catalog link must include privateUrl or publicUrl.',
  });

const catalogGroupSchema = z
  .object({
    name: z.string().min(1).max(40),
    links: z.array(catalogLinkSchema),
  })
  .strict();

export const catalogSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    site: z
      .object({
        title: z.string().min(1).max(40),
        subtitle: z.string().max(100).optional(),
        theme: catalogThemeSchema.optional(),
        backgroundPattern: catalogBackgroundPatternSchema
          .optional()
          .default(DEFAULT_BACKGROUND_PATTERN),
        webSearch: webSearchProviderSchema.optional().default(DEFAULT_WEB_SEARCH_PROVIDER),
      })
      .strict(),
    groups: z.array(catalogGroupSchema),
  })
  .strict();

export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogGroup = Catalog['groups'][number];
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
