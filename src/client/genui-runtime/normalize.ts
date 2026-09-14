/** Deterministic GenUI alias and structural normalization. */
import { COMPONENT_SCHEMAS } from './schema.ts'
import type { GenuiDiagnostic } from './diagnostics.ts'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function isNode(value: unknown): value is Record<string, unknown> {
  const candidate = record(value)
  return candidate !== undefined && typeof candidate.type === 'string'
}

function normalizeAliasFields(value: Record<string, unknown>, path: string, type: string, warnings: GenuiDiagnostic[], aliases: Readonly<Record<string, string>>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...value }
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (!(alias in out)) continue
    const aliasPath = `${path}.${alias}`
    const keptCanonical = canonical in out
    if (!keptCanonical) out[canonical] = out[alias]
    delete out[alias]
    warnings.push({
      kind: 'alias',
      path: aliasPath,
      message: keptCanonical
        ? `${aliasPath} is ignored because canonical field '${canonical}' is present`
        : `${aliasPath} normalized/adopted as '${canonical}'`,
      type,
      field: alias,
      canonical,
    })
  }
  return out
}

function normalizeNode(value: unknown, path: string, warnings: GenuiDiagnostic[]): unknown {
  if (!isNode(value)) return value
  const type = value.type as string
  const definition = COMPONENT_SCHEMAS[type]
  // Custom nodes are opaque by contract: don't inspect or rewrite their data.
  if (definition === undefined) return value
  const out = normalizeAliasFields(value, path, type, warnings, definition.aliases)
  if (type === 'hero' && out.tone === 'brand') {
    out.tone = 'accent'
    warnings.push({ kind: 'alias', path: `${path}.tone`, message: `${path}.tone value 'brand' normalized as 'accent'`, type, field: 'tone', canonical: 'accent' })
  }
  const normalizeNodeValue = (child: unknown, childPath: string): unknown => normalizeNode(child, childPath, warnings)
  const normalizeNodeArray = (children: unknown, childPath: string): unknown => Array.isArray(children)
    ? children.map((child, index) => normalizeNodeValue(child, `${childPath}[${index}]`))
    : children

  if (type === 'keyvalue' || type === 'steps') {
    const field = type === 'keyvalue' ? 'pairs' : 'steps'
    const aliases: Readonly<Record<string, string>> = type === 'keyvalue' ? { label: 'key' } : { content: 'desc' }
    const entries = out[field]
    if (Array.isArray(entries)) out[field] = entries.map((entry, index) => {
      const holder = record(entry)
      return holder === undefined ? entry : normalizeAliasFields(holder, `${path}.${field}[${index}]`, type, warnings, aliases)
    })
  } else if (type === 'row' || type === 'col' || type === 'grid' || type === 'card' || type === 'file-tree' || type === 'timeline' || type === 'breadcrumb') {
    if (type !== 'file-tree' && type !== 'timeline' && type !== 'breadcrumb') out.items = normalizeNodeArray(out.items, `${path}.items`)
  } else if (type === 'list' && Array.isArray(out.items)) {
    out.items = out.items.map((child, index) => isNode(child) ? normalizeNodeValue(child, `${path}.items[${index}]`) : child)
  } else if (type === 'tabs' && Array.isArray(out.tabs)) {
    out.tabs = out.tabs.map((tab, index) => {
      const holder = record(tab)
      if (holder === undefined) return tab
      const normalizedHolder = { ...holder }
      if ('content' in normalizedHolder) {
        const tabPath = `${path}.tabs[${index}].content`
        const hasItems = 'items' in normalizedHolder
        if (!hasItems) normalizedHolder.items = normalizedHolder.content
        delete normalizedHolder.content
        warnings.push({
          kind: 'alias',
          path: tabPath,
          message: hasItems
            ? `${tabPath} is ignored because canonical field 'items' is present`
            : `${tabPath} normalized/adopted as 'items'`,
          type,
          field: 'content',
          canonical: 'items',
        })
      }
      normalizedHolder.items = Array.isArray(normalizedHolder.items)
        ? normalizedHolder.items.map((child, childIndex) => normalizeNodeValue(child, `${path}.tabs[${index}].items[${childIndex}]`))
        : normalizedHolder.items === undefined
          ? normalizedHolder.items
          : [normalizeNodeValue(normalizedHolder.items, `${path}.tabs[${index}].items[0]`)]
      return normalizedHolder
    })
  } else if (type === 'accordion' && Array.isArray(out.items)) {
    out.items = out.items.map((item, index) => {
      const holder = record(item)
      if (holder === undefined) return item
      return { ...holder, items: Array.isArray(holder.items) ? holder.items.map((child, childIndex) => normalizeNodeValue(child, `${path}.items[${index}].items[${childIndex}]`)) : holder.items }
    })
  }
  return out
}

/**
 * Normalize a raw GenUI value into canonical field names.
 *
 * Only deterministic aliases and structural aliases are changed. Resource
 * limits, type repair, security filtering, and semantic validation remain in
 * the guard layer. Unknown component types are returned opaque.
 *
 * @param value - Raw GenUI spec or bare native component.
 * @returns Canonical value and stable alias diagnostics.
 */
export function normalizeGenuiSpec(value: unknown): { value: unknown; warnings: GenuiDiagnostic[] } {
  const warnings: GenuiDiagnostic[] = []
  const root = record(value)
  if (root === undefined) return { value, warnings }
  if (typeof root.type === 'string') return { value: normalizeNode(root, 'spec', warnings), warnings }
  const out = { ...root }
  if (Array.isArray(out.items)) {
    out.items = out.items.map((item, index) => normalizeNode(item, `items[${index}]`, warnings))
  }
  return { value: out, warnings }
}
