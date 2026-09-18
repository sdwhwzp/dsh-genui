# Upstream preview.2 merge: fork aliases live in the schema registry

Upstream 0.11.1-preview.2 added per-record aliases, `valueAliases`, and nested record normalization. The fork's saved-reply aliases (`hero.number`, `hero.tone: brand`, `steps[].content`, `keyvalue.items[].label`) and diff tolerances are declared in `src/client/genui-runtime/schema.ts` plus `normalizeDiffRecords` in `normalize.ts`; `guard.ts` stays identical to upstream. Both bundles build from that one source, so a fork rule never needs a second copy.

Kept fork behavior: `/panel` claim `name` + `'/panel '` token (Harness 0.1.6 `CommandClaim`), safe links in table cells, direct fence output without pre-validation, early-closed-root reattachment in `parse-partial.ts`. Upstream field-validation fixtures must use invalid values, not these aliases.
