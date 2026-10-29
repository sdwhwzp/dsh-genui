import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'

if (process.argv[2] === 'public-config') {
  const dir = mkdtempSync(join(tmpdir(), 'genui-map-types-'))
  try {
    const file = join(dir, 'consumer.ts')
    writeFileSync(file, `import type { GenuiMapConfig } from ${JSON.stringify(resolve('src/client/map-config.ts'))};\nconst config: GenuiMapConfig = { style: { version: 8, sources: {}, layers: [], glyphs: 'https://host.example/fonts/{fontstack}/{range}.pbf', metadata: { theme: 'host' } } };\nvoid config;\n`)
    const options = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true }
    const host = ts.createCompilerHost(options)
    const originalRead = host.readFile.bind(host), originalExists = host.fileExists.bind(host)
    const enginePath = /(?:^|[/\\])maplibre-gl(?:[/\\@]|$)/
    host.readFile = path => enginePath.test(path) ? undefined : originalRead(path)
    host.fileExists = path => !enginePath.test(path) && originalExists(path)
    const program = ts.createProgram([file], options, host)
    const diagnostics = ts.getPreEmitDiagnostics(program)
    assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [])
    assert.doesNotMatch(readFileSync('src/client/map-config.ts', 'utf8'), /from ['"]maplibre-gl/)
    // Existing hosts can keep the vendor's richer type without a structural cast.
    writeFileSync(file, readFileSync(file, 'utf8') + `\nimport type { StyleSpecification } from ${JSON.stringify(realpathSync(resolve('node_modules/maplibre-gl/dist/maplibre-gl.d.ts')))};\ndeclare const vendorStyle: StyleSpecification; const vendorConfig: GenuiMapConfig = { style: vendorStyle }; void vendorConfig;\n`)
    const vendorProgram = ts.createProgram([file], options)
    assert.deepEqual(ts.getPreEmitDiagnostics(vendorProgram).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
} else if (process.argv[2] === 'browser-fixture') {
    const options = { strict: true, noEmit: true, skipLibCheck: true,
      target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX, allowImportingTsExtensions: true, baseUrl: process.cwd(), paths: {
        '@changfenhuang/dsh-genui/embed': ['src/client/embed.ts'], '@map-test/i18n': ['src/client/i18n/runtime.ts'],
        '@map-test/theme': ['src/client/artifact/standalone-theme.ts'],
      } }
    const program = ts.createProgram([resolve('tests/browser/map.tsx')], options)
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [])
} else {
  throw new Error('Expected public-config or browser-fixture')
}
