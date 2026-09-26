# Panda Count

## Release notes

Every PR that changes what people see on pandacount.net adds an entry to the top of `RELEASES` in
`src/lib/releases.ts`. That list feeds the `/releases` page, which the site footer links to.

- Set `date` (YYYY-MM-DD) to the day the change goes live, and `pr` to the PR number once it is known.
- Write the notes for players, not developers: say what they can now do or what was fixed, in plain sentences.
- Group a PR's changes into one entry. Internal-only changes (refactors, tests, tooling) don't need one.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
