import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

/**
 * The Harness release this deployment runs. Every declared Harness peer range
 * must name its `major.minor.patch` line, or the plugin ships against a Harness
 * its own composition never loads. A prerelease only satisfies a range that
 * carries a prerelease on the same line, so naming the line is the real check.
 */
const DEPLOYED_HARNESS_LINE = '0.1.6'

describe('deployed Harness compatibility', () => {
  it('does not restore the removed client-runtime package', async () => {
    const paths = (await readdir(join(ROOT, 'src'), { recursive: true }))
      .filter(path => /\.[cm]?[jt]sx?$/.test(path))
    const sources = await Promise.all(paths.map(path => readFile(join(ROOT, 'src', path), 'utf8')))
    const manifest = await readFile(join(ROOT, 'package.json'), 'utf8')

    expect([manifest, ...sources].join('\n')).not.toContain('@deepseek-ai/dsh-client-runtime')
  })

  it('names the deployed Harness line in every declared Harness peer range', async () => {
    const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')) as {
      peerDependencies: Record<string, string>
    }
    const harnessPeers = Object.entries(manifest.peerDependencies)
      .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
    expect(harnessPeers.length).toBeGreaterThan(0)

    const refused = harnessPeers
      .filter(([, range]) => !range.includes(DEPLOYED_HARNESS_LINE))
      .map(([name]) => name)
    expect(refused).toEqual([])
  })
})
