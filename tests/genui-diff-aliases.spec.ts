import { describe, expect, it } from 'vitest'
import { processGenuiSpec, repairGenuiSpec } from '../src/client/guard.ts'
import { normalizeGenuiSpec } from '../src/client/genui-runtime/normalize.ts'

// Deployment fork: saved replies carry diff nodes under alias containers,
// as single records, with alias record fields, or as raw unified-diff
// strings. Every one of them must still render through the shared
// normalization used by both bundles (host validate_dsh_ui + browser).
describe('GenUI diff node aliases', () => {
  const unified = '--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,2 @@\n-const a = 1\n+const a = 2\n same'

  it.each([
    ['diff', { type: 'diff', diff: [{ path: 'x.ts', newText: 'b' }] }],
    ['changes', { type: 'diff', changes: [{ path: 'x.ts', newText: 'b' }] }],
    ['files', { type: 'diff', files: [{ path: 'x.ts', newText: 'b' }] }],
  ])('adopts the %s container name', (_name, node) => {
    const processed = processGenuiSpec({ items: [node] })
    expect(processed.errors).toEqual([])
    expect(processed.repaired?.items).toEqual([{ type: 'diff', diffs: [{ path: 'x.ts', oldText: null, newText: 'b' }] }])
  })

  it('wraps a single record object into a one-element list', () => {
    const processed = processGenuiSpec({ items: [{ type: 'diff', diffs: { path: 'x.ts', newText: 'b' } }] })
    expect(processed.errors).toEqual([])
    expect(processed.repaired?.items).toEqual([{ type: 'diff', diffs: [{ path: 'x.ts', oldText: null, newText: 'b' }] }])
  })

  it('adopts file/new/old record field names', () => {
    const node = { type: 'diff', diffs: [{ file: 'x.ts', new: 'b', old: 'a' }, { filename: 'y.ts', after: 'd', before: 'c' }] }
    const processed = processGenuiSpec({ items: [node] })
    expect(processed.errors).toEqual([])
    expect(processed.repaired?.items).toEqual([{ type: 'diff', diffs: [
      { path: 'x.ts', oldText: 'a', newText: 'b' },
      { path: 'y.ts', oldText: 'c', newText: 'd' },
    ] }])
    expect(processed.warnings.map(warning => warning.path)).toContain('items[0].diffs[0].file')
  })

  it('splits a unified-diff string container into a pathless record', () => {
    const processed = processGenuiSpec({ items: [{ type: 'diff', content: unified }] })
    expect(processed.errors).toEqual([])
    expect(processed.repaired?.items).toEqual([{ type: 'diff', diffs: [{ path: '', oldText: 'const a = 1\nsame', newText: 'const a = 2\nsame' }] }])
  })

  it('splits a record that carries only a unified-diff string', () => {
    const node = { type: 'diff', diffs: [{ path: 'x.ts', diff: unified }, { text: '+only new' }] }
    const processed = processGenuiSpec({ items: [node] })
    expect(processed.errors).toEqual([])
    expect(processed.repaired?.items).toEqual([{ type: 'diff', diffs: [
      { path: 'x.ts', oldText: 'const a = 1\nsame', newText: 'const a = 2\nsame' },
      { path: '', oldText: null, newText: 'only new' },
    ] }])
  })

  it('keeps a wholly missing container and an empty string a contract error', () => {
    expect(processGenuiSpec({ items: [{ type: 'diff' }] }).errors).toContain("items[0]: type 'diff' requires diffs (array)")
    // Partial rendering keeps the envelope; the blank diff node itself is dropped.
    expect(repairGenuiSpec({ items: [{ type: 'diff', content: '   ' }] })).toEqual({ items: [] })
    expect(normalizeGenuiSpec({ items: [{ type: 'diff', diffs: 42 }] }).value).toEqual({ items: [{ type: 'diff', diffs: 42 }] })
  })
})
