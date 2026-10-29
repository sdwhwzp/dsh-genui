import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { it } from 'vitest'

const timeout = Number(process.env.GENUI_TYPECHECK_TIMEOUT_MS ?? 30_000)

it('type-checks public map configuration with the engine package unavailable', { timeout }, async () => {
  await promisify(execFile)(process.execPath, [resolve('tests/fixtures/map-typecheck.mjs'), 'public-config'], { timeout, windowsHide: true })
})
