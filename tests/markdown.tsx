import {
  MarkdownText as PrimitiveMarkdownText,
  type MarkdownFileMentions,
  type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'

const LABELS: MarkdownLabels = {
  code: { copyLabel: '复制', copiedLabel: '已复制' },
  footnotes: '脚注',
}

/** Alpha.3 Markdown harness with the owner-supplied localized labels. */
export function MarkdownText({ text, streaming, fileMentions }: {
  text: string
  streaming?: boolean | undefined
  fileMentions?: MarkdownFileMentions | undefined
}) {
  return (
    <PrimitiveMarkdownText
      text={text}
      streaming={streaming}
      labels={LABELS}
      fileMentions={fileMentions}
    />
  )
}
