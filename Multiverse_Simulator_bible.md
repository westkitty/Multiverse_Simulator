# Multiverse Simulator — Project Bible

Additive cross-session ledger. Current operative state lives in OPERATIONAL_STATE.md and live GitHub PR/Actions metadata.

## 2026-10-11 — Source-patch recovery and publication gate

### Repository and authority
- Repo: westkitty/Multiverse_Simulator (public).
- Starting main commit: cb6bc9b4456f2cb45b7610c0df6d3325bd67a5eb, previously verified nine-world baseline.
- User explicitly authorized fixing this patch, staging, committing, pushing, and merging to main. No force push, destructive rollback, or unrelated edits.
- Branch: patch/omniverse-ii-text-import-20261011; PR #2.
- GitHub connector was the authorized write path. Isolated sandbox network DNS could not reach GitHub, and npm dependencies were not locally cached. Verification therefore ran in actual GitHub Actions.

### Frozen repair scope
- Preserve all nine original scientific worlds, determinism, history, persistence, IndexedDB, workers, exploration, archive semantics and browser interaction, while importing the six new worlds and Atlas source.
- The text patch contained 175 file-change sections: 136 reconstructible text blobs and 39 binary-only placeholders. Of the text blobs, 37 already matched main and 99 needed changes. All 136 blob SHA prefixes were checked against the uploaded patch.
- Original omitted binaries: 24 source-dependent ZIP archives and 15 local visual QA screenshots. Do not invent the original bytes.

### Accepted repairs and source checks
1. GitHub CI checks out the full repository history and reconstructs nine original-world ZIPs using the pinned historical source commit cb6bc9b. It compares original recorded state and continuation hashes, with the same seed and intervention commands.
2. Pre-refuge 15-world Atlas source commit 7e7f933 was a local-only checkpoint never pushed to GitHub. CI creates state-equivalent ZIPs using current source with old legacy commands, only when the separately recorded historical state/continuation oracles match for all 15 worlds. This is not proof of byte-equivalent old archives or full migration from real old files.
3. ZIP bytes include an export timestamp (exportedAtIso), so even true source replay cannot reproduce the old SHA-256 without the old timestamp. Generated ZIPs have newly computed checksums and retain old expected SHA as provenance rather than falsifying byte identity.
4. Original 15 PNG evidence files remain unavailable; before/after visual evidence is not reproduced from the text-only patch.

### Baseline and validation receipts
- First PR CI run 38164405196: typecheck and lint PASS; 25 failed tests (24 missing archives and one 15.066ms/step wall-clock assertion), so build/browser steps were not run.
- Intermediate recovery commit f12e7a2 failed a raw byte hash comparison due the archive format timestamp. Source regeneration itself passed.
- Subsequent repair commit d8668b3 compared deterministic state oracles and reverified the byte digest of each actual generated archive.
- CI run: https://github.com/westkitty/Multiverse_Simulator/actions/runs/38164837699
- At this entry time, archive reconstruction, typecheck, lint, full standard tests, explicit default-resource/semantic/historical acceptance, production build, and distribution verification were observed to pass; Chromium/browser checks were still running. Inspect actual GitHub run status before claiming browser or merge success.

### Protected purpose and remaining work
- A passing CI is not certification of 12 distinct authored mechanics or semantic-content tripling in every world, durable unattended economy health, actual hardware FPS, or deployed Pages.
- GitHub Pages deployment of prior main failed configure-pages (404); a PR check cannot independently prove live HTTPS delivery.
- Original old Atlas binaries, the local old checkpoint, and original screenshot pixels are not available through current repo; retain provenance, never overwrite golden state/continuation oracles to get green tests.
- The PR and GitHub commits are the source of truth for later delivery/merge state; this checkpoint does not guess future merge outcome.

### Git delivery lineage
- Text import commit pushed: f93d16d64484d291d0b58a0a777fcf98a77f1868.
- Historical generator initial attempt: f12e7a23977f5d022fe50d42da83fac9b5cfcf7b.
- State-oracle repair: d8668b33c11a091dfa8cb781961e46e2b2a2f013.
- This entry deliberately omits its own commit SHA and a not-yet-proven merge SHA.
