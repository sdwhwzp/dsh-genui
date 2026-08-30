/** Localized labels for Harness UI primitives rendered by GenUI. */

import type { DiffBlockLabels, JsonTreeLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Chinese labels for the shared diff renderer. */
export const diffBlockLabels: DiffBlockLabels = {
  copy: '复制',
  copied: '复制成功',
  collapseAria: '收起差异',
  expandAria: hidden => `展开其余 ${hidden} 行差异`,
  collapse: '收起',
  expand: hidden => `… 其余 ${hidden} 行`,
  files: count => `${count} 个文件`,
}

/** Chinese labels for the shared JSON inspector. */
export const jsonTreeLabels: JsonTreeLabels = {
  copyValue: '复制值',
  copyJson: '复制 JSON',
  copyPath: '复制属性路径',
  copyPrettyJson: '复制格式化 JSON',
  copyCompactJson: '复制紧凑 JSON',
  copied: '复制成功',
  copyFailed: '复制失败',
  collapseNode: '收起 JSON 节点',
  expandNode: '展开 JSON 节点',
  copyButtonTitle: action => `${action}；右键可选择其他复制方式`,
}

/** Labels for shared code-block copy controls. */
export const codeBlockLabels = {
  copyLabel: '复制',
  copiedLabel: '复制成功',
} as const
