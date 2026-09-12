import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parsePartialGenuiSpec, reattachStrandedItems } from '../src/client/parse-partial.ts'

/**
 * The body is a verbatim capture from a production session (2026-09-13): the
 * model closed `items` and the root object after two components, then kept
 * appending a `table` and a `callout` as if still inside the array. The card
 * froze on the first two components for the rest of the message.
 */
const BODY = readFileSync(
  join(process.cwd(), 'tests/fixtures/early-closed-root.fence.json'),
  'utf8',
)

/** Top-level component types the parser recovered from a body prefix. */
function typesOf(raw: string): string[] {
  const spec = parsePartialGenuiSpec(raw)
  if (spec === null) return []
  return (spec.items ?? []).map(item => String((item as { type?: unknown }).type))
}

describe('early-closed root', () => {
  it('is the damage the fixture carries: a complete root followed by more components', () => {
    expect(() => JSON.parse(BODY)).toThrow()
    // The prefix really is a finished object — this is not an incomplete body,
    // so tier-2 completion does not apply to it.
    expect(() => JSON.parse(BODY.slice(0, 600))).not.toThrow()
    expect(BODY.slice(600).trimStart().startsWith(',')).toBe(true)
  })

  it('recovers every stranded component instead of stopping at the early close', () => {
    expect(typesOf(BODY)).toEqual(['callout', 'steps', 'table', 'callout'])
  })

  it('keeps rendering forward while the stranded tail is still streaming', () => {
    // Cut mid-way through the stranded `table` — the reader must still see the
    // components that are already finished, and must never see a partial one.
    const midTable = BODY.indexOf('"rows"')
    expect(midTable).toBeGreaterThan(600)
    expect(typesOf(BODY.slice(0, midTable))).toEqual(['callout', 'steps'])

    // Once the table closes, it joins them — this is the frame that used to
    // never arrive until the message settled.
    const afterTable = BODY.indexOf('{"type":"callout","tone":"warning"')
    expect(afterTable).toBeGreaterThan(midTable)
    expect(typesOf(BODY.slice(0, afterTable))).toEqual(['callout', 'steps', 'table'])
  })

  it('leaves an undamaged body alone', () => {
    const healthy = '{"title":"t","items":[{"type":"text","text":"a"}]}'
    expect(reattachStrandedItems(healthy)).toBeNull()
    expect(typesOf(healthy)).toEqual(['text'])
  })

  it('does not fire when the trailing text is not a continuation of items', () => {
    // A complete root followed by something that is not `,<component>` stays
    // untouched: the repair must not invent structure.
    expect(reattachStrandedItems('{"title":"t","items":[{"type":"text","text":"a"}]} trailing')).toBeNull()
  })
})

/**
 * A second production capture (2026-09-13 04:30), different break offset and a
 * different first component: the damage is recurrent model behaviour, not a
 * one-off, so the repair is pinned against more than one shape.
 */
const BODY2 = readFileSync(
  join(process.cwd(), 'tests/fixtures/early-closed-root-2.fence.json'),
  'utf8',
)

describe('early-closed root (second capture)', () => {
  it('carries the same damage at a different offset', () => {
    expect(() => JSON.parse(BODY2)).toThrow()
    expect(() => JSON.parse(BODY2.slice(0, 662))).not.toThrow()
  })

  it('recovers the stranded callout that used to never arrive', () => {
    expect(typesOf(BODY2)).toEqual(['table', 'callout'])
  })
})
