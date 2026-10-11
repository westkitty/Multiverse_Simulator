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

## 2026-10-11 — Acceptance-led reliability repair (PR #3)

### Authority and baseline
- Task: apply the OMNIVERSE II end-to-end brief to current repository source; maintain fifteen-world kernel, histories, mobile UI, stateful exploration and release gates. User explicitly permits staged verified commits/pushes and release when actually safe.
- Branch: `fix/omniverse-command-atomicity-and-ci-stress`, based on main `4bd19e03eaf2704fee8e3c98dffc7ec17586ac83`.
- PR #3: https://github.com/westkitty/Multiverse_Simulator/pull/3
- Last implementation commit: `2cd039afb28203e56889a7e04928434bc864ba87` (this documentation commit intentionally does not include its own SHA).
- Independent GitHub Actions run: https://github.com/westkitty/Multiverse_Simulator/actions/runs/38182073580 ; see live result for latest CI state.
- Historical proof is in `docs/current-inventory.json`, `docs/acceptance/REVIEW.md` and `docs/refuge-uplift/REVIEW.md`. New source-grounded traceability table: `docs/OMNIVERSE_II_RELEASE_GATE.md`.

### Implemented change groups
1. Fixed command-bus atomicity: failed plugin intervention restores world state, config, RNG streams and causal event journal instead of leaking false applied effects; later queued work is retained. Both interactive and scheduled command paths are guarded; earlier successes and successful command reference metadata survive.
2. Made noisy stress test reproducible: retained hard 15 ms/tick threshold in isolated three-repetition median test. Preserved normal bounded workload tests and production fast-forward deadline. No increase in limits or artificial FPS claims.
3. Explicitly reconciled remaining release blockers: Pages disabled, absent admin mutation ability, physical-device unverified, semantic 3× unproven, 2000-tick late-life economic degradation, old ZIP/archive provenance unavailable.

### Guardrails / test evidence
- No new dependency; no schema/version migration; old world IDs and generated histories remain untouched.
- Source code touched only `src/core/kernel.ts`, `src/test/adversarialStress.test.ts`, new `src/test/commandAtomicity.test.ts`, `package.json`, `.github/workflows/deploy.yml`.
- During this entry, new PR run 38182073580 has verified `npm ci`, nine historic archive reconstructions, fifteen Atlas state oracle checks, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:performance`. Remaining later stages may still be running; the run itself is authoritative.
- GitHub main before this PR had `has_pages:false` and had failed a one-shot parallel-test clock assertion. Do not call the merged source a live website or the full OMNIVERSE II task complete.

### Remaining work
1. Finish/verify current PR CI and review exact diff before main merge; preserve branch if unresolved failures.
2. Enable Pages (GitHub repository settings, Source GitHub Actions) and obtain deploy + public smoke receipts. If denied, leave as blocker.
3. Build/test richer historical semantics, unique 3× domain consequences, durable resource health and real device performance before claiming final brief fulfillment.
