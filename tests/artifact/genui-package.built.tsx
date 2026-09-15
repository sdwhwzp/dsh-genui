/** Exercise the emitted browser and Host entries against saved reply fields. Requires a build. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as reactDom from 'react-dom/client'
import * as cordis from '@deepseek-ai/cordis'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as host from '../../lib/index.js'

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

type BrowserEntry = {
  renderGenuiFence(raw: string, key: string, context?: { source: { id: string; order: number[] } }): React.ReactNode
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

afterEach(cleanup)

describe('published entries with Harness primitives', () => {
  it('keeps saved itinerary aliases through completion and replay in the emitted browser code', () => {
    const entry = browserEntry()
    const partial = itinerary.slice(0, itinerary.indexOf(',{"type":"keyvalue"')) + ','
    const view = render(<div data-streaming="true">{entry.renderGenuiFence(partial, 'artifact')}</div>)
    expect(screen.getByText('三天两夜')).toBeTruthy()
    view.rerender(<div>{entry.renderGenuiFence(itinerary, 'artifact', { source: { id: 'saved-itinerary', order: [1, 0, 0] } })}</div>)
    expect(screen.getByText('参观博物馆')).toBeTruthy()
    expect(screen.getByText('江边酒店')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '第二天' }))
    expect(screen.getByText('湖边散步')).toBeTruthy()
    view.unmount()
    render(<div>{entry.renderGenuiFence(itinerary, 'replay', { source: { id: 'saved-itinerary', order: [1, 0, 0] } })}</div>)
    expect(screen.getByText('住宿推荐')).toBeTruthy()
    expect(document.querySelector('pre')).toBeNull()
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
      expect(verdict).toContain('✅')
      expect(verdict).toContain('items[2].items → items[2].pairs')
      expect(verdict).toContain('items[2].pairs[0].label → items[2].pairs[0].key')
      expect(verdict).toContain('content → items[1].tabs[0].items[0].steps[0].desc')
    } finally {
      await plugin?.dispose()
      await prompt.dispose()
    }
  })
})
