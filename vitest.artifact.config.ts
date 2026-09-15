/** Built-package checks use the selected Harness declarations and React primitives. */
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import base from './vitest.config.ts'

const harnessRoot = process.env.GENUI_HARNESS_ROOT
if (harnessRoot === undefined) throw new Error('GENUI_HARNESS_ROOT must name a built Harness checkout')

export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: [
      ...base.resolve!.alias as Array<{ find: RegExp; replacement: string }>,
      { find: /^@deepseek-ai\/dsh-client-ui-primitives$/, replacement: resolve(harnessRoot, 'packages/client/ui-primitives/lib/index.js') },
      { find: /^@deepseek-ai\/dsh-system-prompt$/, replacement: resolve(harnessRoot, 'packages/core/system-prompt/lib/index.js') },
    ],
  },
  test: { ...base.test, include: ['tests/artifact/*.built.tsx'] },
})
