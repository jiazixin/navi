import { fetchJSON } from './client';
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

const catalogFailures = {
  http: '请求暂时无法完成。',
  unreadable: '服务返回了无法读取的数据。',
  invalid: '服务返回的数据不符合目录协议。',
};

export function getCatalog(signal?: AbortSignal): Promise<Catalog> {
  return fetchJSON('/api/catalog', catalogSchema, catalogFailures, signal);
}
