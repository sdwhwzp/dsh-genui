import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { installDomFenceRenderer } from '../src/client/dom-fence.tsx'
import { renderGenuiFence } from '../src/client/fence-render.tsx'
import { processGenuiSpec } from '../src/client/guard.ts'

const itinerary = {
  title: '三日行程',
  items: [
    { type: 'hero', number: '3', title: '三天两夜' },
    { type: 'tabs', tabs: [
      { label: '第一天', items: [{ type: 'steps', steps: [{ title: '上午', content: '参观博物馆' }] }] },
      { label: '第二天', items: [{ type: 'steps', steps: [{ title: '下午', content: '湖边散步' }] }] },
    ] },
    { type: 'keyvalue', items: [{ label: '住宿推荐', value: '江边酒店' }, { label: '预算', value: '1500 元' }] },
  ],
}
const raw = JSON.stringify(itinerary)
const partial = raw.slice(0, raw.indexOf(',{"type":"keyvalue"')) + ','

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

describe('itinerary field compatibility', () => {
  it('preserves all itinerary content in canonical fields', () => {
    const result = processGenuiSpec(itinerary)
    expect(result.errors).toEqual([])
    expect(result.repaired?.items).toEqual([
      { type: 'hero', value: '3', title: '三天两夜' },
      { type: 'tabs', tabs: [
        { label: '第一天', items: [{ type: 'steps', steps: [{ title: '上午', desc: '参观博物馆' }] }] },
        { label: '第二天', items: [{ type: 'steps', steps: [{ title: '下午', desc: '湖边散步' }] }] },
      ] },
      { type: 'keyvalue', pairs: [{ key: '住宿推荐', value: '江边酒店' }, { key: '预算', value: '1500 元' }] },
    ])
    expect(result.warnings.every(warning => warning.kind === 'alias')).toBe(true)
    expect(itinerary.items.at(-1)).toHaveProperty('items')
  })

  it('keeps explicit canonical fields and rejects invalid alias values', () => {
    expect(processGenuiSpec({ type: 'keyvalue', items: [{ label: '预算', value: '1500 元' }] }).errors).toEqual([])
    expect(processGenuiSpec({ items: [
      { type: 'hero', title: '标题', value: '2', number: '3' },
      { type: 'steps', items: [{ title: '上午', desc: '原文', content: '别名' }] },
      { type: 'keyvalue', pairs: [{ key: '原键', label: '别名', value: '原值' }], items: [] },
    ] }).repaired?.items).toEqual([
      { type: 'hero', title: '标题', value: '2' },
      { type: 'steps', steps: [{ title: '上午', desc: '原文' }] },
      { type: 'keyvalue', pairs: [{ key: '原键', value: '原值' }] },
    ])
    for (const node of [
      { type: 'keyvalue', items: 'invalid' },
      { type: 'keyvalue', items: [{ label: 42, value: 'invalid' }] },
      { type: 'keyvalue', pairs: null, items: [{ label: 'valid', value: 'valid' }] },
      { type: 'steps', steps: [{ title: '上午', content: {} }] },
    ]) expect(processGenuiSpec({ items: [node] }).errors.length).toBeGreaterThan(0)
  })

  it('keeps the registry UI when the last component arrives and on replay', () => {
    const view = render(<div data-streaming="true">{renderGenuiFence(partial, 'itinerary')}</div>)
    expect(screen.getByText('三天两夜')).toBeTruthy()
    view.rerender(<div>{renderGenuiFence(raw, 'itinerary', { source: { id: 'itinerary', order: [1, 0, 0] } })}</div>)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('住宿推荐')).toBeTruthy()
    expect(screen.getByText('参观博物馆')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '第二天' }))
    expect(screen.getByText('湖边散步')).toBeTruthy()
    view.unmount()
    render(<div>{renderGenuiFence(raw, 'replay', { source: { id: 'itinerary', order: [1, 0, 0] } })}</div>)
    expect(screen.getByText('江边酒店')).toBeTruthy()
    expect(document.querySelector('pre')).toBeNull()
  })

  it('keeps the DOM UI through streaming completion and host remount', async () => {
    const row = document.createElement('div')
    row.setAttribute('data-chat-anchor-key', 'assistant:1')
    row.setAttribute('data-streaming', '')
    const block = document.createElement('div')
    block.className = 'md-code-block'
    block.innerHTML = '<div><div></div></div><pre><code></code></pre>'
    block.querySelector('code')!.textContent = partial
    row.append(block)
    document.body.append(row)
    const ctx = { sessions: { list: { getSnapshot: () => ({ current: 'itinerary-session' }) } } } as unknown as Context
    const dispose = installDomFenceRenderer(ctx, () => {})
    try {
      await waitFor(() => expect(document.querySelector('.genui-dom-fence')?.textContent).toContain('三天两夜'))
      block.querySelector('code')!.textContent = raw
      block.firstElementChild!.firstElementChild!.textContent = 'dsh-ui'
      row.removeAttribute('data-streaming')
      await waitFor(() => expect(document.querySelector('.genui-dom-fence')?.textContent).toContain('江边酒店'))
      expect(block.style.display).toBe('none')
      const replay = block.cloneNode(true) as HTMLElement
      replay.style.display = ''
      replay.removeAttribute('data-genui-rendered')
      row.replaceChildren(replay)
      await waitFor(() => expect(document.querySelector('.genui-dom-fence')?.textContent).toContain('参观博物馆'))
      expect(replay.style.display).toBe('none')
    } finally {
      dispose()
    }
    expect(document.querySelector('.genui-dom-fence')).toBeNull()
  })
})
