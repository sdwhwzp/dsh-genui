import { describe, expect, it } from 'vitest'
import { processGenuiSpec } from '../src/client/guard.ts'

// Production reply (deployment fork): two callouts carried their body under
// `message` / `description`, the validator reported "requires content" for
// both, and repair dropped them ("declared 10, rendered 8"). Every body
// alias and a title-only callout must keep the node.
describe('GenUI callout body aliases', () => {
  const tenItems = {
    title: '部署检查',
    items: [
      { type: 'text', content: '概览' },
      { type: 'stat', label: '实例', value: '3' },
      { type: 'stat', label: '错误', value: '0' },
      { type: 'text', content: '说明' },
      { type: 'callout', tone: 'warning', title: '注意', message: '重启前确认会话空闲' },
      { type: 'text', content: '步骤' },
      { type: 'callout', tone: 'info', description: '所有路径都由网关签发 principal' },
      { type: 'keyvalue', pairs: [{ key: '版本', value: 'preview.2' }] },
      { type: 'text', content: '结论' },
      { type: 'text', content: '完成' },
    ],
  }

  it('renders all ten items when two callouts use message/description', () => {
    const processed = processGenuiSpec(tenItems)
    expect(processed.errors).toEqual([])
    expect(processed.declaredNativeCount).toBe(10)
    expect(processed.renderedNativeCount).toBe(10)
    expect(processed.repaired?.items[4]).toEqual({ type: 'callout', tone: 'warning', title: '注意', content: '重启前确认会话空闲' })
    expect(processed.repaired?.items[6]).toEqual({ type: 'callout', tone: 'info', content: '所有路径都由网关签发 principal' })
    expect(processed.warnings.map(warning => warning.path)).toEqual(expect.arrayContaining(['items[4].message', 'items[6].description']))
  })

  it.each(['text', 'body', 'desc', 'message', 'description'])('adopts %s as the callout body', field => {
    const processed = processGenuiSpec({ items: [{ type: 'callout', [field]: '正文' }] })
    expect(processed.errors).toEqual([])
    expect(processed.repaired?.items).toEqual([{ type: 'callout', content: '正文' }])
  })

  it('renders a title-only callout with the title as its body', () => {
    const processed = processGenuiSpec({ items: [{ type: 'callout', tone: 'success', title: '已完成' }] })
    expect(processed.errors).toEqual([])
    expect(processed.repaired?.items).toEqual([{ type: 'callout', tone: 'success', content: '已完成' }])
    expect(processed.warnings.map(warning => warning.path)).toContain('items[0].title')
  })

  it('keeps a bodiless, titleless callout a contract error', () => {
    const processed = processGenuiSpec({ items: [{ type: 'callout', tone: 'info' }] })
    expect(processed.errors).toContain("items[0]: type 'callout' requires content (string)")
  })
})
