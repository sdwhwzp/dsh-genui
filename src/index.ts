/**
 * Bundle source entry (plugin_check tool-bundle contract): the node-half
 * surface the host loader resolves through `package.json#main`.
 *
 * The type-only controller import installs the current client `ctx.sessions`
 * declaration before TypeScript reaches the browser plugin through this root.
 */
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
export * from './plugin/index'
