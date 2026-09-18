/**
 * Partial GenUI spec parsing: extract the components that are already
 * complete from a still-growing ```dsh-ui fence body, so the UI can render
 * top-down as the model writes — each finished component appears the moment
 * its JSON object closes, instead of the whole block waiting for the fence.
 *
 * Strategy (tolerant, white-list-agnostic, BOUNDED):
 * 1. Full parse first (the common settled case) — at most one.
 * 2. ONE left-to-right scan collects the repair candidates: every position
 *    where the prefix is bracket-balanced (trailing comma / fence tail) and
 *    every top-level `items[]` component close (an unfinished trailing
 *    component is dropped by closing the root array/object). Partial candidates
 *    must parse as a spec root; bare components wait for their own root close.
 *    The ring buffer keeps only the longest-direction candidates (≤ MAX_PARTIAL_REPAIR_ATTEMPTS),
 *    so the work is O(n) with a hard parse-attempt cap — a pathological
 *    input can never re-scan prefixes or burn seconds in JSON.parse.
 * 3. Candidates are tried longest first; the first that parses as a GenUI
 *    spec wins. Nothing parses → null (streaming partial, wait for more).
 *
 * The result is only ever a PREFIX of the intended spec, so it is always
 * safe to render: components already present are complete and valid.
 *
 * `ponytail:` the 32-candidate / 33-parse budget is the protection ceiling;
 * only real streaming samples proving a recovery shortfall justify switching
 * to a tokenizing parser.
 */
import { isGenuiSpec, type GenuiSpec } from './spec.ts'
import { wrapSingleComponentRoot } from './spec.ts'

/** Default repair-candidate budget (adjustable; see the design doc). */
export const MAX_PARTIAL_REPAIR_ATTEMPTS = 32

let repairAttemptsLimit = MAX_PARTIAL_REPAIR_ATTEMPTS

/** How many early-closed roots one body may carry before the repair gives up. */
export const MAX_REATTACH_PASSES = 8

/** Override the repair-candidate budget (tests / tuning). */
export function setMaxPartialRepairAttempts(n: number): void {
  repairAttemptsLimit = n
}

/** One repair candidate: a balanced prefix of the body ending at `end`,
 *  plus the closing brackets to append (empty when already balanced). */
export interface PartialCandidate {
  end: number
  closingSuffix: string
}

/** Single left-to-right pass over the raw body. Tracks the bracket stack
 *  (skipping strings/escapes correctly) and records:
 *  - every position where the prefix is fully balanced (trailing comma or
 *    fence tail) — candidate with an empty closing suffix;
 *  - every top-level `items[]` component close — candidate with the root
 *    array/object closed (an unfinished trailing component is dropped). Nested
 *    object closes are not candidates because their component is still partial.
 *  Candidates are ring-buffered to the attempts budget (the LAST pushes are
 *  the longest), then returned longest-first, deduplicated by end. The scan
 *  stops at the first unbalanced close — earlier balanced prefixes remain
 *  valid candidates.
 *
 * Exposed for tests (the `scannedChars` diagnostic); not exported from the
 * package entry. The parser calls this exactly once per parse.
 */
export function collectPartialCandidates(raw: string): { candidates: PartialCandidate[]; scannedChars: number } {
  const stack: string[] = []
  const candidates: PartialCandidate[] = []
  const push = (c: PartialCandidate): void => {
    if (candidates.length >= repairAttemptsLimit) candidates.shift()
    candidates.push(c)
  }
  let inString = false
  let escaped = false
  let scanned = 0
  for (; scanned < raw.length; scanned++) {
    const ch = raw[scanned]!
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') {
      stack.push(ch)
      continue
    }
    if (ch === '}' || ch === ']') {
      const open = stack.pop()
      const expects = ch === '}' ? '{' : '['
      if (open !== expects) {
        // Unbalanced (mismatched or stray close): the tail is unusable, but
        // balanced prefixes recorded earlier stay valid. Stop scanning.
        break
      }
      if (ch === '}' && stack.length === 2 && stack[0] === '{' && stack[1] === '[') {
        // Only a direct root-array member can be a finished component.
        // Partial parsing later requires an actual spec root, so a bare
        // component's data[] member cannot become a candidate.
        push({ end: scanned + 1, closingSuffix: ']}' })
      }
      if (stack.length === 0) {
        // Whole prefix balanced: a complete-JSON candidate (trailing comma /
        // fence tail cases).
        push({ end: scanned + 1, closingSuffix: '' })
      }
      continue
    }
  }
  candidates.sort((a, b) => b.end - a.end)
  const deduped: PartialCandidate[] = []
  for (const c of candidates) {
    if (deduped.length === 0 || deduped[deduped.length - 1]!.end !== c.end) deduped.push(c)
  }
  return { candidates: deduped.slice(0, repairAttemptsLimit), scannedChars: scanned }
}

/** Try to parse a candidate as a GenuiSpec. */
function trySpec(candidate: string, allowSingleComponentRoot: boolean): GenuiSpec | null {
  try {
    let value: unknown = JSON.parse(candidate)
    // Double-encoded body (issue #186): the whole spec arrived as a JSON
    // string — decode exactly once so the fence channel reaches the guard,
    // which reports the rewrite when the same value arrives un-parsed from a
    // tool call.
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch {
        return null
      }
    }
    if (isGenuiSpec(value)) return value
    // A root-level component list is the envelope minus its braces (issue
    // #186): adopt it as `items` instead of rejecting the body.
    if (Array.isArray(value) && value.length > 0) return { items: value }
    // Single-component roots are part of the documented fence vocabulary
    // (e.g. a bare {"type":"callout",…} body) — wrap into a col so the
    // items-gated pipeline renders them (panel/append hoisted).
    return allowSingleComponentRoot ? wrapSingleComponentRoot(value) : null
  } catch {
    return null
  }
}

/**
 * Reattach components the model stranded outside an early-closed root.
 *
 * Observed in the wild: the model closes `items` and the root object, then
 * keeps appending components as if still inside the array —
 * `{"title":…,"items":[A,B]},{"type":"table",…}]}`. The body is not
 * incomplete, so tier-2 completion does not apply; and the forward scan stops
 * at the first unbalanced close, so the longest candidate stays the
 * already-closed prefix. The card therefore freezes on A and B for the rest
 * of the message and only fills in once the message settles.
 *
 * The repair is deterministic string surgery, safe while streaming: it fires
 * only when a COMPLETE root object is followed by `,`, and it reopens that
 * root's `items` array so the stranded text continues it. Whatever follows is
 * still handed to the normal candidate scan, so a half-written trailing
 * component is dropped exactly as before.
 * @param text - the trimmed fence body.
 * @returns the reopened body, or null when this damage is not present.
 */
export function reattachStrandedItems(text: string): string | null {
  // The damage repeats: a model that closed the root once usually closes it
  // again after each further component (observed 2x in the capture below), so
  // one pass leaves the next component stranded. Bounded like every other scan
  // in this module — a pathological body cannot spin here.
  let current = text
  for (let pass = 0; pass < MAX_REATTACH_PASSES; pass += 1) {
    const next = reattachOnce(current)
    if (next === null) return current === text ? null : current
    current = next
  }
  return current === text ? null : current
}

/** One reattach pass; null when this body carries no early-closed root. */
function reattachOnce(text: string): string | null {
  const { candidates } = collectPartialCandidates(text)
  // The root close is the LAST balanced prefix the scan reached; candidates
  // come longest-first, so the first one that parses as a whole object wins.
  for (const candidate of candidates) {
    if (candidate.closingSuffix !== '') continue
    const head = text.slice(0, candidate.end)
    const rest = text.slice(candidate.end)
    if (!rest.trimStart().startsWith(',')) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(head)
    } catch {
      continue
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue
    if (!Array.isArray((parsed as { items?: unknown }).items)) continue
    // Reopen `…]}` into `…` so `rest` continues the items array.
    const reopened = head.replace(/\]\s*\}\s*$/, '')
    if (reopened === head) continue
    return reopened + rest
  }
  return null
}

/**
 * Parse a possibly incomplete genui spec body.
 * @param raw - the fence body as accumulated so far.
 * @returns a spec containing only finished components, or null when nothing
 *   usable has been written yet.
 */
export function parsePartialGenuiSpec(raw: string): GenuiSpec | null {
  const text = raw.trim()
  if (text === '') return null

  // 1. Full parse (settled / already-complete body).
  const full = trySpec(text, true)
  if (full !== null) return full

  // 2. Early-closed root: the model shut `items`/the root and kept appending
  //    components. This must be tried BEFORE the plain candidate scan — that
  //    scan happily returns the already-closed prefix, which is exactly the
  //    frozen card this repair exists to unfreeze.
  const reattached = reattachStrandedItems(text)
  if (reattached !== null) {
    const whole = trySpec(reattached, true)
    if (whole !== null) return whole
    const retry = collectPartialCandidates(reattached)
    for (const candidate of retry.candidates) {
      const spec = trySpec(reattached.slice(0, candidate.end) + candidate.closingSuffix, false)
      if (spec !== null) return spec
    }
  }

  // 3. Bounded repair: ONE forward scan, at most `repairAttemptsLimit`
  //    candidates, longest first — never a re-scan per `}`.
  const { candidates } = collectPartialCandidates(text)
  for (const candidate of candidates) {
    const spec = trySpec(text.slice(0, candidate.end) + candidate.closingSuffix, false)
    if (spec !== null) return spec
  }

  // 4. Not even one complete element yet (e.g. `{"items":[{"type":"tex`).
  return null
}
