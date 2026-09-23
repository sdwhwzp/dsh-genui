import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { completeFenceJson, describeJsonFailure, insertMissingPropertyCommas, repairFenceJson } from '../src/shared/fence-repair.ts'
import { resolveGenuiSpec } from '../src/client/fence-render.tsx'
import { createValidateDshUiTool } from '../src/plugin/tool.ts'

// Production failure (deployment fork): the model dropped the comma between
// two top-level properties, JSON.parse reported position 224 (line 4 column
// 1), and the settled fence stayed a code block.
const fixture = readFileSync(resolve(import.meta.dirname, 'fixtures/missing-property-comma.fence.json'), 'utf8')

describe('missing property comma repair', () => {
  it('reproduces the production position 224 / line 4 column 1 failure', () => {
    expect(describeJsonFailure(fixture)).toContain('字符 224')
    expect(() => JSON.parse(fixture)).toThrow(/position 224 \(line 4 column 1\)/)
  })

  it('inserts exactly one comma and both repair tiers adopt it', () => {
    const inserted = insertMissingPropertyCommas(fixture)
    expect(inserted.repairs).toBe(1)
    const parsed = JSON.parse(inserted.text) as { subtitle: string; items: unknown[] }
    expect(parsed.items).toHaveLength(2)
    expect(repairFenceJson(fixture)).toEqual({ text: inserted.text, repairs: 1 })
    expect(completeFenceJson(fixture)).toEqual({ text: inserted.text, repairs: 1 })
  })

  it('renders the complete fence through the browser resolve path', () => {
    const spec = resolveGenuiSpec(fixture)
    expect(spec?.items).toHaveLength(2)
    expect(spec?.items[0]).toMatchObject({ type: 'callout', tone: 'warning' })
  })

  it('hands the model the repaired JSON from validate_dsh_ui', async () => {
    const value = String(await createValidateDshUiTool().execute({ spec: fixture }))
    expect(value).toContain('status=invalid')
    expect(value).toContain('repair_count=1')
    expect(value).toContain('next=emit_repaired_fence')
    expect(value).toContain('"subtitle"')
  })

  it.each([
    ['a newline inside a string value', '{"a": "x\n"b": 1}'],
    ['array elements', '["a"\n"b"]'],
    ['a same-line omission', '{"a": "x" "b": 1}'],
    ['a key after an opener or colon', '{\n"a":\n"x"}'],
  ])('leaves %s alone', (_name, raw) => {
    expect(insertMissingPropertyCommas(raw).repairs).toBe(0)
  })

  it('composes with the other tier-1 fixes', () => {
    const raw = '{\n  "a": "他说"你好"",\n  "b": 1\n  "c": [1, 2,]\n}'
    const repaired = repairFenceJson(raw)
    // Two escaped inner quotes + the missing comma + the trailing comma.
    expect(repaired?.repairs).toBe(4)
    expect(JSON.parse(repaired!.text)).toEqual({ a: '他说"你好"', b: 1, c: [1, 2] })
  })
})
