# nac-web specifics

## Building and checking

- **pnpm monorepo. There is no `dev` script.** Run the client with
  `pnpm -C packages/client exec vite --port 5173 --strictPort`.
- **`packages/stoat.js` is a git submodule** (`bluecords/javascript-client-sdk`) and the client
  imports its **built** `lib/`, which is gitignored. **After any SDK change run `npm run build`
  inside `packages/stoat.js`** or the client silently type-checks against the previous build.
  This cost a debugging detour on 2026-08-30 — the errors looked like a broken change and were
  a stale artifact.
- **`tsc --noEmit -p packages/client/tsconfig.json` has 2 pre-existing errors** (18 until
  2026-09-02, 6 until 2026-09-03). Compare the count before and after; a non-zero count is not
  automatically yours.
  ⚠️ **DO NOT TREAT THE BACKLOG AS NOISE. It has now yielded real defects TWICE.** 3 of the original
  18 were real (nac-web#109), and **4 of the following 6 were real too** (nac-web#124): four call
  sites rendered `UserStatus.Graphic` - a bare `<circle>` - inside a plain `<div>` with no SVG
  ancestor, so **the presence dot painted nothing at all** in the favourites list, the DM list, the
  mobile messages overlay and the mobile nav avatar. The `size="10px"` each passed was the tell:
  that component has no `size` prop and does not spread props, so it was silently dropped.
  **A prop a component does not declare is not a style nit - it is a signal the wrong component is
  being used.**
  **The 2 that remain are genuinely typing-only:** `playsInline` on `<video>` in `GifPicker` and
  `Embed`. Measured in Solid's runtime, not assumed: `playsInline` is in Solid's known-properties
  set and `playsinline` is mapped for `VIDEO`, so the attribute really is applied and the iOS
  fullscreen fix from nac-web#43 is genuinely in effect. Leave them.
- **This clone's fetch refspec is `main` only**, so a pushed branch never gets a remote-tracking
  ref and `gh pr create` aborts with *"you must first push the current branch to a remote"* even
  though the push succeeded. **Pass `--head <branch> --base main`.** Check with
  `git ls-remote --heads origin <branch>` before believing the push failed.
- **`eslint` prints hundreds of `Delete ␍` errors** from the CRLF working tree. Filter them
  (`| grep -v "Delete"`); the committed blobs are LF and CI is clean.

## Traps found the hard way

- **A `<Trans>` whose children are text/element/text was seen rendering the element THREE times**
  (`simple non-sexualsimple non-sexualsimple non-sexual`), which is why `PolicyChange.tsx` splits
  that string into three `<Trans>` fragments.
  ⚠️ **RE-MEASURED 2026-09-02 AND IT DID NOT REPRODUCE.** A probe component rendered through the
  real dev server + real `I18nProvider` produced **exactly one** copy in all three shapes tested:
  text/element/text, element/element/text, and text/element/text nested inside the mdui `Checkbox`
  slot. The macro compiles to the correct lingui form — numbered placeholders plus a `components`
  map — in every case.
  **What this does and does not license:**
  - ✅ **`LinkWarning.tsx` is CLEAN.** That was the open "has not been checked" item; it is checked
    now, by render, not by reading. Do not re-open it.
  - ❌ **Do NOT rip the three-fragment workaround out of `PolicyChange.tsx` on the strength of
    this.** It was only re-measured in the **dev** build; a production build was not tested, and
    that wording is approved, load-bearing copy. "Live disagrees with the file" is not proof of a
    bug. If someone wants the fragments gone, measure a production build first.
  - The original cause is **unknown** — possibly fixed by a dependency bump, possibly build-specific,
    possibly misdiagnosed at the time. Recorded as unknown rather than guessed at.
- `Text` does not accept `onClick` — wrap it in a `div`.
- `Checkbox` is an **mdui web component**; rich markup in its slot does not render reliably.
  Keep labels outside it.
