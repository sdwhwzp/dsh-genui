/** Exercise the emitted browser and Host entries against saved reply fields. Requires a build. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SidechatSurface } from '@changfenhuang/dsh-genui/client'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as reactDom from 'react-dom/client'
import * as cordis from '@deepseek-ai/cordis'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as host from '@changfenhuang/dsh-genui'

const itinerary = JSON.stringify({
  title: '三日行程',
  items: [
    { type: 'hero', number: '3', title: '三天两夜', tone: 'brand' },
    { type: 'tabs', tabs: [
      { label: '第一天', items: [{ type: 'steps', steps: [{ title: '上午', content: '参观博物馆' }] }] },
      { label: '第二天', items: [{ type: 'steps', steps: [{ title: '下午', content: '湖边散步' }] }] },
    ] },
    { type: 'keyvalue', items: [{ label: '住宿推荐', value: '江边酒店' }] },
  ],
})

function clientContext(providers: Record<string, unknown> = {}) {
  return {
    get: () => undefined,
    inject: (names: readonly string[], callback: (scope: {
      get: (name: string) => unknown
      effect: (setup: () => (() => void)) => (() => void)
    }) => void) => {
      if (names.every(name => providers[name] !== undefined)) callback({
        get: name => providers[name],
        effect: setup => {
          const dispose = setup()
          disposers.push(dispose)
          return dispose
        },
      })
      return () => {}
    },
    sessions: {
      list: { getSnapshot: () => ({ ids: ['artifact-session'] }) },
      retainInfo: () => ({ getSnapshot: () => ({ retainedBy: { mainView: 1 } }) }),
    },
    slots: { inject: (_name: string, callback: () => () => void) => callback(), register: () => () => {} },
  }
}

type BrowserEntry = { apply(ctx: ReturnType<typeof clientContext>): () => void }
const disposers: Array<() => void> = []

/** Exercise the emitted entry through the stock Host DOM fence channel. */
function mountFence(raw: string, key: string, streaming = false) {
  const row = document.createElement('div')
  row.dataset.chatAnchorKey = key
  row.dataset.chatFlowKind = 'assistant-step'
  const block = document.createElement('div')
  block.className = 'md-code-block'
  const banner = document.createElement('div')
  const label = document.createElement('div')
  label.textContent = 'dsh-ui'
  banner.append(label)
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  pre.append(code)
  block.append(banner, pre)
  row.append(block)
  function update(body: string, active: boolean) {
    row.toggleAttribute('data-streaming', active)
    code.textContent = body
  }
  update(raw, streaming)
  document.body.append(row)
  return { row, update, remove: () => row.remove() }
}

/** Run the published module-loader wrapper with the real selected primitives. */
function browserEntry(): BrowserEntry {
  const modules: Record<string, unknown> = {
    react: React, 'react/jsx-runtime': jsx, 'react-dom/client': reactDom,
    '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-ui-primitives': primitives,
  }
  const loader = {
    load(entry: { id: string; factory: (require: (id: string) => unknown) => unknown }) {
      expect(entry.id).toBe('@changfenhuang/dsh-genui')
      return entry.factory(id => {
        if (!(id in modules)) throw new Error(`Unexpected external: ${id}`)
        return modules[id]
      })
    },
  }
  let result: BrowserEntry | undefined
  const old = Object.getOwnPropertyDescriptor(window, '__ModuleLoader__')
  Object.defineProperty(window, '__ModuleLoader__', { configurable: true, value: {
    load(entry: Parameters<typeof loader.load>[0]) { result = loader.load(entry) as BrowserEntry },
  } })
  try {
    new Function(readFileSync(resolve(process.cwd(), 'lib/client.js'), 'utf8'))()
  } finally {
    if (old === undefined) Reflect.deleteProperty(window, '__ModuleLoader__')
    else Object.defineProperty(window, '__ModuleLoader__', old)
  }
  if (result === undefined) throw new Error('Browser artifact did not register')
  return result
}

afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose()
  cleanup()
  document.body.replaceChildren()
})

describe('published entries with Harness primitives', () => {
  it('shares provider aliases and routes emitted sidechat controls to their owning child', async () => {
    let adapter: { mount: (surface: SidechatSurface) => (() => void) } | undefined
    const providerDispose = vi.fn()
    const provider = { registerSidechatSurfaceAdapter: vi.fn((value: typeof adapter) => {
      adapter = value
      return providerDispose
    }) }
    disposers.push(browserEntry().apply(clientContext({ genuiSidechat: provider, betterSidebar: provider })))
    expect(provider.registerSidechatSurfaceAdapter).toHaveBeenCalledTimes(1)
    if (adapter === undefined) throw new Error('Emitted client did not register a sidechat adapter')
    const raw = JSON.stringify({ items: [
      { type: 'input', id: 'choice', label: 'Child choice' },
      { type: 'submit', label: 'Continue child', action: 'continue' },
    ] })
    const root = document.createElement('div')
    root.setAttribute('data-genui-surface', 'artifact-provider/sidechat')
    const block = document.createElement('div')
    block.className = 'md-code-block'
    const pre = document.createElement('pre')
    pre.textContent = `${raw}\n`
    block.append(document.createElement('div'), pre)
    root.append(block)
    document.body.append(root)
    const sendPrompt = vi.fn(async (_text: string) => {})
    const mountedAdapter = adapter
    await act(async () => { disposers.push(mountedAdapter.mount({
      root, source: 'artifact-provider/sidechat', threadId: 'artifact-child', eventSeq: 8,
      contentBlockIndex: 2, text: `\`\`\`dsh-ui\n${raw}\n\`\`\``, sendPrompt,
    })) })
    fireEvent.change(within(root).getByRole('textbox'), { target: { value: 'child-only' } })
    const button = within(root).getByRole('button', { name: 'Continue child' })
    fireEvent.click(button)
    expect(sendPrompt).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('"choice":"child-only"'))
    expect(sendPrompt.mock.calls[0]![0]).toMatch(/^\[genui-action\] continue /)
    const unmount = disposers.pop()!
    await act(async () => { unmount(); fireEvent.click(button) })
    expect(sendPrompt).toHaveBeenCalledTimes(1)
    expect(root.querySelector('[data-genui]')).toBeNull()
    expect(block.style.display).toBe('')
    expect(providerDispose).not.toHaveBeenCalled()
  })

  it('keeps saved itinerary aliases through completion and replay in the emitted browser code', async () => {
    disposers.push(browserEntry().apply(clientContext()))
    const partial = itinerary.slice(0, itinerary.indexOf(',{"type":"keyvalue"')) + ','
    const fence = mountFence(partial, 'saved-itinerary', true)
    await waitFor(() => expect(screen.getByText('三天两夜')).toBeTruthy())
    fence.update(itinerary, false)
    await waitFor(() => expect(screen.getByText('江边酒店')).toBeTruthy())
    expect(screen.getByText('参观博物馆')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '第二天' }))
    expect(screen.getByText('湖边散步')).toBeTruthy()
    fence.remove()
    await waitFor(() => expect(document.querySelector('.genui-dom-fence')).toBeNull())
    const replay = mountFence(itinerary, 'saved-itinerary')
    await waitFor(() => expect(screen.getByText('住宿推荐')).toBeTruthy())
    expect(replay.row.querySelector('.genui-dom-fence')?.querySelector('pre')).toBeNull()
  })

  it('renders precise category totals and hover details through the emitted browser code', async () => {
    disposers.push(browserEntry().apply(clientContext()))
    const raw = JSON.stringify({ items: [{ type: 'chart', data: [], horizontal: true, stacked: true,
      series: [
        { label: 'A', data: [{ label: 'Q1', value: 0.1 }, { label: 'Q2', value: 1.234 }] },
        { label: 'B', data: [{ label: 'Q1', value: 0.2 }, { label: 'Q2', value: 2.2 }] },
      ],
    }] })
    const fence = mountFence(raw, 'chart-totals')
    await waitFor(() => expect([...fence.row.querySelectorAll('[class*="hbarValue"]')].map(node => node.textContent)).toEqual(['0.3', '3.434']))
    expect(fence.row.querySelector('[class*="hbarTrack"][title]')?.getAttribute('title')).toBe('Q1: 0.3')
    fireEvent.mouseEnter(fence.row.querySelector('[class*="hbarSeg"]')!)
    expect(fence.row.querySelector('[class*="chartTip"]')?.textContent).toContain('0.3')
    expect(fence.row.querySelector('.genui-dom-fence')?.textContent).not.toContain('0.30000000000000004')
  })

  it('validates the same saved itinerary through the emitted Host tools', async () => {
    const ctx = new cordis.Context()
    const registered = new Map<string, { name: string; execute(args: unknown): Promise<unknown> }>()
    const prompt = await ctx.plugin(SystemPrompt)
    let plugin: Awaited<ReturnType<typeof ctx.plugin>> | undefined
    try {
      ctx.provide('tools', { register(tool: { name: string; execute(args: unknown): Promise<unknown> }) {
        registered.set(tool.name, tool)
        return () => { registered.delete(tool.name) }
      } })
      plugin = await ctx.plugin(host)
      const verdict = String(await registered.get('validate_dsh_ui')!.execute({ spec: itinerary }))
      expect(verdict).toContain('status=valid')
      expect(verdict).toContain('warning=alias_normalized path=items[2].items canonical=items[2].pairs')
      expect(verdict).toContain('warning=alias_normalized path=items[2].pairs[0].label canonical=items[2].pairs[0].key')
      expect(verdict).toContain('warning=alias_normalized path=items[1].tabs[0].items[0].steps[0].content canonical=items[1].tabs[0].items[0].steps[0].desc')
    } finally {
      await plugin?.dispose()
      await prompt.dispose()
    }
  })
})
