# Panda Count

## Release notes

Every PR that changes what people see on pandacount.net adds an entry to the top of `RELEASES` in
`src/lib/releases.ts`. That list feeds the `/releases` page, which the site footer links to.

- Set `date` (YYYY-MM-DD) to the day the change goes live, and `pr` to the PR number once it is known.
- Write the notes for players, not developers: say what they can now do or what was fixed, in plain sentences.
- Group a PR's changes into one entry. Internal-only changes (refactors, tests, tooling) don't need one.
