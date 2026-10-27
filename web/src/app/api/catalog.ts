import { api } from '../api'
import { z } from './schema'

// Go counts Unicode code points, not UTF-16 code units.
function textSchema(minimum: number, maximum: number) {
  return z.string().refine((value) => {
    const length = Array.from(value).length
    return length >= minimum && length <= maximum
  }, `Expected ${minimum} to ${maximum} characters.`)
}

const httpURLSchema = z
  .url()
  .max(4096)
  .refine((value) => {
    const parsed = new URL(value)
    if (parsed.username || parsed.password) return false
    const protocol = parsed.protocol
    return protocol === 'http:' || protocol === 'https:'
  }, 'Only http and https URLs are supported.')

// Keep the server field names throughout the client.
// Unknown response fields are ignored (代码规范.md §5.2).
const catalogLinkSchema = z
  .object({
    runtime_id: z.string().min(1).max(256),
    name: textSchema(1, 60),
    description: textSchema(0, 120).optional(),
    private_url: httpURLSchema.optional(),
    public_url: httpURLSchema.optional(),
    tags: z.array(textSchema(1, 24)).max(10).default([]),
  })
  .refine((link) => link.private_url !== undefined || link.public_url !== undefined, {
    message: 'A catalog link must include private_url or public_url.',
  })

const catalogGroupSchema = z.object({
  name: textSchema(1, 40),
  links: z.array(catalogLinkSchema).max(1000),
})

const catalogPageSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  title: textSchema(1, 40),
  subtitle: textSchema(0, 100).optional(),
  groups: z.array(catalogGroupSchema).max(1000),
})

export const catalogSchema = z.object({
  revision: z.number().int().nonnegative(),
  pages: z
    .array(catalogPageSchema)
    .min(1)
    .max(20)
    .refine(
      (pages) =>
        pages.reduce(
          (total, page) =>
            total + page.groups.reduce((count, group) => count + group.links.length, 0),
          0,
        ) <= 1000,
      { message: 'Catalog must not exceed 1000 links.' },
    )
    .refine((pages) => new Set(pages.map((page) => page.id)).size === pages.length, {
      message: 'Catalog page IDs must be unique.',
    }),
})

export type Catalog = z.infer<typeof catalogSchema>
export type CatalogPage = Catalog['pages'][number]
export type CatalogGroup = CatalogPage['groups'][number]
export type CatalogLink = CatalogGroup['links'][number]

// The catalog comes from the operator's configuration, so it is validated.
export async function getCatalog(signal?: AbortSignal): Promise<Catalog> {
  return await api<Catalog>('/catalog', { signal, schema: catalogSchema })
}
