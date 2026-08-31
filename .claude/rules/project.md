# nac-web specifics

## Building and checking

- **pnpm monorepo. There is no `dev` script.** Run the client with
  `pnpm -C packages/client exec vite --port 5173 --strictPort`.
- **`packages/stoat.js` is a git submodule** (`bluecords/javascript-client-sdk`) and the client
  imports its **built** `lib/`, which is gitignored. **After any SDK change run `npm run build`
  inside `packages/stoat.js`** or the client silently type-checks against the previous build.
  This cost a debugging detour on 2026-08-30 — the errors looked like a broken change and were
  a stale artifact.
- **`tsc --noEmit -p packages/client/tsconfig.json` has 18 PRE-EXISTING errors.** Compare the
  count before and after; a non-zero count is not automatically yours.
- **`eslint` prints hundreds of `Delete ␍` errors** from the CRLF working tree. Filter them
  (`| grep -v "Delete"`); the committed blobs are LF and CI is clean.

## Traps found the hard way

- **A `<Trans>` whose children are text/element/text renders the element THREE times.** Seen on
  screen: `simple non-sexualsimple non-sexualsimple non-sexual`. Split into separate `<Trans>`
  fragments around the element. `LinkWarning.tsx` uses the same pattern and has **not** been
  checked.
- `Text` does not accept `onClick` — wrap it in a `div`.
- `Checkbox` is an **mdui web component**; rich markup in its slot does not render reliably.
  Keep labels outside it.
