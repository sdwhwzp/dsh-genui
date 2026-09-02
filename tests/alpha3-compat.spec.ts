import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

describe('Harness Alpha.4 compatibility', () => {
  it('does not restore the removed client-runtime package', async () => {
    const paths = (await readdir(join(ROOT, 'src'), { recursive: true }))
      .filter(path => /\.[cm]?[jt]sx?$/.test(path))
    const sources = await Promise.all(paths.map(path => readFile(join(ROOT, 'src', path), 'utf8')))
    const manifest = await readFile(join(ROOT, 'package.json'), 'utf8')

    expect([manifest, ...sources].join('\n')).not.toContain('@deepseek-ai/dsh-client-runtime')
  })

  it('declares the Alpha.4 client entry packages', async () => {
    const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')) as {
      peerDependencies: Record<string, string>
    }

    expect(manifest.peerDependencies['@deepseek-ai/dsh-api-session-controller']).toBe('^0.1.2-alpha.4')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-client-ui-renderer']).toBe('^0.1.2-alpha.4')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-client-ui-tool']).toBe('^0.1.2-alpha.4')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-util-values']).toBe('^0.1.2-alpha.4')
  })
})
