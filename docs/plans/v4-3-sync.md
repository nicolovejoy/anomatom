# v4.3 · sync in Make your own

Status: merged and smoked 2026-11-01 (governor Opus, session 1208; PRs 76 plan, 77 S2 sync link (Sonnet), 78 S1 pad and swap (Opus); one Opus fresh-eyes review each, the should-fix fixed before merge). Rulings in review: a swap that would leave a crossing 0 is refused with its own note, as is a swap across hands. Main went red between 77 and 78 (`e2e/sync.spec.ts` still expected `#v2.`; fixed in 78). Checkpoint smoke headless on anomatom.com: sync-edit, sync, share and deck specs, 109 passed on Edge and WebKit. Follow-ups: issue 79 (docked wheel band one row off a typed 97531); move MAX_PATTERN_CHARS and MAX_SYNC_CHARS into tunables.ts; S1 review nits (swapRefusal on an unread sync draft judges the old parts; a swap in a `(…)*` draft loses the mirror; no e2e of the passing pad layout; the cross-hand e2e has no viewport or error listener). The sync carry-overs of v3 (`docs/plans/v3-classics-controls.md`, status line): `( , )` keys on the digit pad, a short link for sync, swap on a sync set. Nothing here touches the Mapping or the Sound and Kit controls; that is v5 (`docs/plans/v5-sound-brief.md`).

## Rulings (governor, 2026-11-01)

1. **The digit pad writes sync.** `(` shows on the pad always, so a sync pattern can be started from the pad; `,` and `)` show while the input holds a `(` or the parts are a sync set, as `p` shows for passing (`showsPassKey`, `src/app/knobs-model.ts:107`). The rule is a pure function in `knobs-model.ts`, beside `showsPassKey`. `*` is not added (the box is typed out in full, as `syncText` writes it). Layout stays four to a row; the keys keep the pad's square cells; nothing on the pad moves for a vanilla pattern beyond the one new `(` key.
2. **Swap works on a sync set.** Two throws of one hand, chosen in the one sync input, swap by MATH.md §3 on that hand's part, step 2 (the spacing), with `x` (the destination part) moving with the landing: core `swapSites` already does this. Throws in different hands do not swap (as `a / b` across the slash today). Worked case, added to MATH.md §11 and as a unit test: in the box `(4,2x)(2x,4)`, swapping the left hand's two throws gives `(4x,2x)(2,4)`, valid, 3 balls. `(4,4)` has one throw per hand: nothing to swap.
3. **A short link for sync.** `#(4,2x)(2x,4)`, with `~PRESET` and `@BPM` as the other short forms. `(`, `)` and `,` are legal in a fragment (RFC 3986 sub-delims) and are written unescaped. A sync link decodes through `partsFromSync`, the parser the Pattern tab uses, and `encodeHash` keeps it only when it round-trips, as for the other forms; anything else writes `#v2.`. `#v2.` sync links keep opening. The grammar comment in `src/app/route.ts` gains the `sync` line, and MATH.md §11's last line ("a sync set's link is `#v2.`") is updated.

## Streams (parallel worktrees)

**S1 · Pad and swap** (Opus). Owns `src/app/knobs-model.ts`, `src/app/mount-knobs.ts`, `src/app/knobs.css`, `src/core/swap.ts` only if needed, `src/ui/copy.ts` (pad key labels), `docs/MATH.md` §11 (the worked case only), their unit tests, `e2e/knobs.spec.ts` or a new `e2e/sync-edit.spec.ts`.
- Rulings 1 and 2. Logic pure, at 100% lines where the module is listed in `vitest.config.ts`.
- Unit: the key rule for a vanilla, a passing, a sync draft and a sync set; `swapAction` on the box maps the left hand's two sites to part 0 and gives `(4x,2x)(2,4)`; a cross-hand pair gives null.
- e2e (390×844 and 1280×800): from Make your own on a cleared input, the pad types `(4,2x)(2x,4)` and it plays as 3 balls; choosing the left hand's two throws enables Swap and Swap gives `(4x,2x)(2,4)`.

**S2 · Sync short link** (Sonnet). Owns `src/app/route.ts`, `src/app/hash.ts`, `src/app/share.ts` only if needed, their unit tests, `e2e/share.spec.ts`, `docs/MATH.md` §11 (the last line only).
- Ruling 3.
- Unit: the box, `(4,4)`, `(6x,4)(4,6x)` and `(4x,2x)` encode short and round-trip; with `~height-drum` and `@140`; a sync set with a non-default mapping or phase writes `#v2.`; an old `#v2.` sync link still decodes; a junk `#(4,` loads the defaults.
- e2e: the Box card's address is `#(4,2x)(2x,4)~height-drum` (or whatever the card's preset is) and pasting it in a new page plays the box.

Both: CI green, one fresh-eyes review per PR, screenshots in the report. S1 and S2 touch MATH.md §11 in different paragraphs; whoever merges second rebases.

Checkpoint: the governor smokes headless on anomatom.com (type the box on the pad, swap it, open its short link), then hands Nico a short smoke.
