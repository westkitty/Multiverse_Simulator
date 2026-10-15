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

## 2026-10-11 — OMNI site-memory uplift (PR #4)

**Goal and baseline.** The user invoked `Omni` during continuing work on the established fifteen-world project. Current main `e393a3511d0728792c887ac9d12e0133fcbfb5f5` was verified from GitHub; repository Pages was still disabled and its production workflow had passed validation before failing the Pages configuration step. Existing `OPERATIONAL_STATE.md` and the global release-gate matrix were read before changes.

**Frozen three-group change set.**
1. Derived `siteChronicle` and `compareSiteRealities` selectors: show player-recorded transitions and real localized simulation events; preserve run, tick, branch and causal event IDs; expose no site history before visit or unsurveyed counterpart measurements; require identical world ID, deterministic seed, site archetype, seed and coordinates to compare. Differences are not themselves causes.
2. Ground the Curiosity Engine in actual localized causal events (one journal indexing pass, fixed 48-tick expiry), preserving branch isolation and never revealing secret event identities to surveyed-only contacts.
3. Build an accessible mobile Site Memory/parallel-run interface with observed deltas, casefile entries, selection, resource-difference drilldowns and production browser/unit tests.

**Protected invariants.** All fifteen world IDs, plugins and domain state transitions; archived golden oracle values; historical ZIP compatibility; fixed timestep and RNG streams; save format and IndexedDB; unknown-site presentation boundary; native Three.js scenes and existing UI navigation. No new dependency or schema migration. Public publication, historical bytes, device hardware and semantic-depth certification are explicitly excluded from any green PR claim.

**Implementation Git.** Branch `uplift/omniverse-site-chronicles-20261011`, PR #4. Source commits `75def170`, `4f72c593`, `39c9903f`, `a1586f40`, `2811f3d1`. TypeScript compilation initially reported an implicit-any site callback at AtlasView:55; the last source commit constrains the type to the existing SiteDefinition. CI on the final documentation head must be checked before claiming a verified outcome.

**Evidence discipline.** This produces actual histories of gameplay within each simulated reality. It does NOT retroactively create unique simulated formation histories or guarantee all 540 POIs have divergent mechanics. Prior-art scout: Caves of Qud's developer materials illustrate historical accounts connecting sites and discoveries; adopted only the design lesson of tying a location's story to inspectable records, not any external code or assets (https://cavesofqud.com/roadmap/).

**Remaining gates.** Strict CI typecheck/lint/test/acceptance/build/dist/browser pass at actual head, diff audit and safe integration if authorized, Pages admin activation, public live browser proof, semantic/historical breadth, late-life economy and physical hardware performance. Current owner of success claims: exact GitHub Actions and PR/branch API state, not these written intentions.

## 2026-10-11 — OMNI III deterministic fork replay, proof-state UX

### Baseline, purpose and authority
- Current main at preflight: `2f7bd919e44bf46451d02ade267b6447ba4bc6ca`. Main workflow run 38189010957 was green through validation, failed only at Pages activation `configure-pages`; this does not prove a public site. Work isolated on `uplift/omniverse-branch-replay-provenance-20261011`; PR https://github.com/westkitty/Multiverse_Simulator/pull/5.
- Accepted change groups: (1) fork checkpoint + RNG + causal-journal replay and inherited-parent command exclusion; (2) exact authoritative-hash proof and fail-closed historical/fork integrity; (3) History-screen honesty and dedicated regression tests. No dependencies, schema-version increment, default world-state changes, generated-content inflation or physical performance claims.

### Implementation and evidence
- `src/core/contracts.ts`: optional `CheckpointSnapshot.replayJournal`, emitted only for newly created branch origins. Root checkpoints retain previous serialization. `src/core/kernel.ts` pins the first branch-origin checkpoint, records journal baseline and includes it in budget telemetry. Replays start at fork tick and deterministically execute only child commands, restoring root or branch provenance without altering actual worlds.
- Legacy child archives that have an intact original `reality_branched` event can reconstruct their causal boundary; archives missing the event fail closed. A historical tick with no stored independent checkpoint never returns a falsely successful hash. Corrupted snapshots and wrong sequence boundaries are rejected.
- `src/store/multiverseStore.ts` and `src/ui/views/TimelineView.tsx`: visible status differentiates a validated replay, a real mismatch and an unavailable proof. Receipts are scoped to current run/tick/hash.
- Tests: new `src/test/branchReplay.test.ts`, `src/test/branchReplayUi.test.tsx`, strengthened `src/test/siteChronicle.test.ts`. The first run reported a strict return variable typo, repaired in `3e8e1dd6`. Acceptance, browser and perf gates on the final documentation SHA must be read from actual Actions jobs; no result is claimed here.

### Cautions, rollback and next actions
- Preserve original nine legacy world behavior, all 15 new world IDs, root export shape and historical oracle values. Never overwrite golden archives merely to get green tests. For forks with an evicted legacy branch event, surface unverifiability, not a forged replay.
- Existing `restoreCheckpoint` may retain later event journal entries; choose a bounded separately reviewed repair if confirmed in real UI journeys. Remaining requirements: substantial unique stories/mechanics, late-life economy controls, real-device performance, omitted binary originals, and Pages administration/public smoke.
- Review complete patch and GitHub Actions run at exact head, then merge only on green validation under the established release gate. Record actual merge SHA and update the operational-state entry on the next pass.


## 2026-10-12 — Immersive multiverse exploration direction and candidate implementation

### User intent and product identity
The project is not merely an abstract fifteen-world data laboratory. The explicitly corrected core journey is to **enter every multiverse in Three.js and explore actual navigable spaces with discoverable, actionable locations**. The original analytical lab remains a protected support experience. Treat visual-only flyover or repeated procedural primitives as an initial slice, not final game certification.

### Source/authority decisions
- Actual simulation state belongs to the original `SimulationKernel`, world plugins and exploration command validators. 3D positions, decorations, camera motion and actor tweening are presentation only; no renderer RNG may alter simulation replay or archives.
- Scenes derive location positions, route topology, blockages, condition, discovery and actor populations from existing Atlas/native region data. Unknown identity and historical details remain sealed; there is no invented NPC population, economy, event or false historical proof.
- In-world **Detect**, **Survey**, **Discover**, **Travel**, **Investigate**, **Repair**, **Operate** and tick advancement must reach the existing authoritative command path, not fake UI counters. Other complex operations remain in the full Atlas dossier until supported.
- Keep controls keyboard, pointer and touch-capable; protect DOM accessibility and WebGL failure recovery. Make 3D entry a discoverable first-class route without removing old observatory functions.

### Evidence and limits
PR #6: https://github.com/westkitty/Multiverse_Simulator/pull/6. Main baseline `c070beb6` is publicly deployed with 16/16 Chromium desktop/mobile public-smoke cases (run 38192688920), but the gameplay candidate is **not** included in that deployed SHA. Check live PR-head CI for actual execution outcomes, then independently inspect the rendered experience before merge. Physical-device performance, semantic 3× expansion and authored world distinctiveness are not certified.

## 2026-10-12 — OMNI/AWE/AAA gameplay uplift (feature branch `arena/a0f4ba85-multiverse-simulator`)

### Authority and baseline
Verified production baseline `82384387251536212ccfc8e5c087c73d9db74fec` (PR #6 merged and deployed; workflow 38212561808, 20 public-site browser tests). The prior section's note that the gameplay candidate was "not included in that deployed SHA" described its own pre-merge checkpoint and is superseded: enterable Three.js exploration is live on `main`. This work unit executes the engineering directive `Multiverse_Simulator_OMNI_AWE_AAA_QQQ_Performance_Repair_2026-10-12.pdf` on top of that baseline.

### Implemented (presentation layer; simulation authority untouched)
- **World identity**: 15 profile-driven atmospheres (gradient sky textures, starfields, sun/moon/ringed-giant/nebula/storm-eye anchors, adaptive fill light), deterministic terrain heightfields with vertex-colored ground and canopy planes, composed scenery (site rings, region clusters, route dressing) plus a flora layer. All randomness is `sceneHash`-derived; kernel RNG and state hashes are covered by tests as unchanged.
- **Game feel**: content-argmax spawn and arrival facing; velocity-damped movement; Shift sprint on foot; reduced-motion-aware head bob and sprint FOV; terrain ground-following; interaction distance in the HUD readout.
- **QQQ repair (P1)**: the shipped movement basis was horizontally mirrored against the Three.js camera (`W` drifted sideways at most headings). `movementBasis(yaw)` is now shared by view and tests, verified against `THREE.PerspectiveCamera.getWorldDirection` at six headings. Previous tests asserted only coordinate change, never direction.
- **Performance**: layout-projection cache (0.45 ms → 0.009 ms signature on unchanged ticks), zero per-frame allocation in movement, hidden-tab render suspension, Lambert terrain, trimmed mesh/star budgets after measurement, full disposal of atmosphere/terrain/flora resources. Matched SwiftShader measurements are recorded in `PERFORMANCE.md`; hardware GPU remains unverified.

### Evidence and limits
Unit 181/181 (3 environment-skipped) incl. 4 new immersive regression tests; acceptance 11/11; performance gate 5/5; build + dist verification PASS; Playwright 20/20 desktop + Pixel 7 emulation with a new spawn-content assertion. Spawn-view draw calls rose from 4–15 (empty quadrant) to 108–186 (measured content) across nine audited worlds; at matched workload SwiftShader frame time is ~1.7–2× baseline — recorded, not hidden. Unfinished: physical-device FPS/memory certification, semantic 3× content expansion, long-run economy balance, human art review of the new atmospheres, and a possible megacity brightness accessibility option. Protected invariants (kernel determinism, archives, site privacy, route gating, Atlas/observatory fallback, Pages deployment) are unchanged and re-verified by the suites above.


## 2026-10-12 — Candidate semantic field protocols (PR pending)

- Branch: `arena/semantic-field-protocols-20261012`, based on GitHub main `0ccc227e45b927c06ec6ef50a17ba966628b832c`.
- Introduced 15 authored, world-specific field questions attached to the first existing three-site investigation chain of each world. Six distinct proof types: observations, restoration, resolution, salvage, archive recovery and containment; completion is calculated from existing recorded evidence and kernel-owned exploration state, never prop or metadata counts. No sites or authoritative mechanics were added. Not a 3× semantic-content expansion.
- Immersive 3D view now includes a collapsible field notebook with verified sample values, tick provenance and context-specific next step. Unknown contacts stay unnamed; authored historical interpretations are explicitly hypotheses, not observed evidence.
- Protected: all 15 worlds and original scripts; kernel, RNG, branching/replay, archive/IndexedDB, economy, route validators and scientific Atlas unchanged. No new state format. Added unit tests and browser assertion; validation at PR head is **pending** (do not represent this entry as a green test result).
- Pending: exact-head GitHub Actions verification, software-rendered browser behavior, independent meaningful-content metric beyond this increment, long-run economy, hardware FPS, human art accessibility.


## 2026-10-12 — Immersive world-system experiments (candidate)

Player request remains: all fifteen worlds should be worth exploring as games without replacing deterministic science. Building on the successfully released PR #10 field notebooks, this candidate adds an explicitly player-triggered **native intervention loop** in the 3D expedition screen: choose one existing world-plugin command, inspect command-bus proof, advance simulated time as desired, read three native numerical metrics, and compare values with the pre-intervention snapshot. The overlay creates no alternate simulation or historical account.

The controlled-response acceptance exercise duplicates each world with the same seed, scenario configuration and run identity, changes one native intervention in the treatment, advances four ticks on both branches, and records actual numeric metric differences. Its coverage is a behavioral breadth indicator, *not* a tripling metric or proof of independently designed facilities. Command families for six frontier worlds still share policy/restoration plumbing. The scientific Observatory keeps its full controls; the in-world deck is a curated entry point.

Implementation is on `arena/native-field-lab-20261012`. Initial QA/CI and release state remain unverified at this dated candidate entry. Do not overwrite this claim with a future success without GitHub Actions and merge/deploy receipts.


## 2026-10-12 — Paid maintenance is not world recovery (PR #12 experiment)

- The user continued OMNI work after successful public PR #11 release (`82f1bee6`; validated Pages run 38306716724). Next bounded priority: determine whether the observed 2000-tick condition collapse is recoverable by the player's existing economy before changing physics or resource defaults.
- In branch `arena/maintenance-economy-lab-20261012` (PR #12), an acceptance-only policy uses the exact same seed/run/finished investigation checkpoint, compares idle and paid repair/travel/resupply, enforces one command per two ticks, obeys native route/fuel/site hazard gates, and verifies save/restore plus deterministic 5-tick continuation. No runtime gameplay source, RNG, world plugin, persistence or UI is touched.
- At tested head `62e4f1ec`, GitHub Actions run [38325861812](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38325861812) passed all existing validation/acceptance/build gates and 20/20 candidate desktop/mobile-emulated Playwright checks. Twelve treatment/control comparisons showed positive condition changes, but persistent broad collapse: Civilization 34 of 36 sites below 25 (zero maintenance trips); Industrial 35/36; Megacity 26/36; Geology 26–28/36. Zero additional expedition resupplies were used in these policies.
- Conclusion: native installation integrity can be improved locally through legitimate paid commands, but that cannot be equated to recovery of native scientific fields, regional access safety or sustainable unattended world operation. Do not relax physics, invent resources, or mark the global economy solved. Investigate whether native scientific interventions can make inaccessible regions recoverable, and test any fix from matched actual commands.
- Full protocol, per-seed evidence and reproduction: `docs/acceptance/MAINTENANCE_ECONOMY_LAB.md`. Exact final PR-head CI, merge and main deployment are **pending** at this dated checkpoint.


## 2026-10-12 — PR #13 native science and route safety, candidate
- PR #12 is publicly verified at merge `6f05cb05f1f922fc43c9921f674f021580f9edc2`; Actions [38328127781](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38328127781) passed validate, Pages deploy and public 20/20 browser smoke.
- New PR [#13](https://github.com/westkitty/Multiverse_Simulator/pull/13) asks whether two native restoration commands reduce late-life region hazards and reopen truly safe, fuel-bounded routes from otherwise identical exhausted worlds, with fixed-step checks at ticks +2 and +30. Controls, seeds and reports: `docs/acceptance/SCIENTIFIC_RECOVERY_ACCESS_LAB.md` and `src/test/nativeScientificAccessLab.ts`.
- No production gameplay code is changed. A positive immediate hazard response is not proof of sustainable economics or long-term site repair. CI/merge/deploy not yet verified at this checkpoint.


## 2026-10-12 — Civilization v2 full housing is not overcrowding (PR #14 candidate)
- The fully deployed PR #13 release is verified at `75b6ce48`, Actions 38332677659 including 20/20 deployed browser tests. PR #14 first diagnostic [38338127190](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38338127190) disproved the initial famine explanation: enormous food/water inventories, no shortages, but stability stuck at 10/100, all 36 sites unsafe. Two Jubilee interventions caused only a six-tick recovery. Actual root: at **population exactly equal to housing capacity**, the legacy code inflicts -1.5 stability points every tick regardless of housing adequacy or supplies.
- New-run Civilization mechanic candidate is **Atlas version 2**, one bounded semantics change: full capacity is neutral, actual overcapacity remains negative, spare capacity remains positive, real shortages retain penalties. v1 legacy saved runs and historical source oracles must remain reproducible. Only Civilization opts into v2 by default; other worlds stay at Atlas v1. Never silently recalculate historical events or reinterpret a v1 checkpoint under v2.
- Source of truth and exact behavioral contract: `docs/acceptance/CIVILIZATION_CAPACITY_FIX.md`; retained disproved hypothesis with receipts: `docs/acceptance/CIVILIZATION_SHORTAGE_RECOVERY_LAB.md`. Candidate code is not yet verified/merged/deployed; promote only after all required Gates prove PASS. No guarantee of indefinite equilibrium or old-save automatic upgrade.


## 2026-10-13 — Restorative world science belongs in the playable field deck (candidate)

- PR #14 is a verified production release at `8e98850d`, [run 38353782557](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38353782557): old archives, Civil v2 access, type/lint/performance/acceptance/build, Pages and 20/20 public browser checks passed. Existing v1 worlds are not silently migrated.
- Industrial, Megacity and Geology have original native scientific restoration commands that can reopen real hazard- and fuel-bounded Atlas routes in matched experiments. The user must not have to exit the playable 3D expedition to issue those *existing* recovery actions. This is an access/usefulness change, not a newly invented mechanic, restored-local-site guarantee or economic rebalancing.
- `src/exploration/nativeFieldExperiments.ts` owns exact plugin IDs and a read-only native `planRoute` access projection; `AtlasView` reuses the original event-verified command bus and provides accessible responsive field controls. No new authoritative state or duplicate field/telemetry owner. Behavior/proof contract: `docs/acceptance/IMMERSIVE_EMERGENCY_RESPONSE.md`.
- Candidate branch `arena/immersive-emergency-recovery-20261013`; CI, merge and deployment are unknown until verified. Global world recovery still needs actual maintenance budgets, site condition and extended-run proof.


## 2026-10-13 — In-world paid site servicing is separate from native global science
- PR #15 has a verified release on Pages at merge `a9c89652`, main Actions [38376436295](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38376436295) with validate, deployment and public smoke all PASS. Native scientific emergency intervention is still not equivalent to local repair, travel or a sustainable maintenance budget.
- Candidate after the proven release: branch `arena/field-service-dispatch-20261013` adds `planFieldService` as a read-only, deterministic triage against actual sites and fuel-safe current route, never unvisited identity or props. Its source action path remains `exploration.action=travel/repair` and `expedition.resupply`, with original stock deductions, journey ticks and event journals. No duplicate authoritative service state is created.
- The in-world service deck presents finite stocks, hazard/route barriers, visited damaged site counts and a real next step. Normal scouting is still required to unlock a site; a simulation intervention cannot create a visited repair target or guarantee route safety. This is a player usability/game loop uplift, not a change to economy fundamentals.
- Verification and exact acceptance contract: `docs/acceptance/FIELD_SERVICE_ORDERS.md`. CI, PR merge, production deploy and public smoke have not yet been verified at this authored candidate checkpoint. Keep 15 worlds, historical state/oracles, Civilization Atlas-v2 versioning and native renderer/controller locked.


## 2026-10-13 — Repair routes must respect finite sources at both ends (recursive bug sweep)
- PR #16 added a native paid service-order panel inside the 3D field deck. A post-merge public-smoke job was initially cancelled despite green validation and deploy; final rerun receipt remains pending at this authored checkpoint.
- Confirmed planner bug: a remote **previously visited** damaged installation reachable only after spending native finite local fuel was labeled totally blocked. The original first-visited local source is the only source allowed by `expedition.resupply`; this correction merely exposes it, never grants fuel or bypasses route safety.
- Confirmed planner bug: origin supplies below two blocked a valid native travel order to a visited destination that holds enough locally transferable repair supplies. Valid service journey: normal fuel-charged travel→tick-driven arrival→destination resupply→two-supply repair. Split finite origin/destination stock transfers are also valid; no remote supplies are fabricated.
- The existing read-only route classifier now distinguishes unsafe destination, insufficient available fuel, and hazardous/closed paths to guide the player. Keep the hazard cap 70, original plugin limits, deterministic persistence and discovery fog immutable.
- Governing scoped ledger: `docs/acceptance/RECURSIVE_SERVICE_BUG_SWEEP_2026-10-13.md`. This is a **candidate**, not a verified release. After feature branch CI and exact-head merge, validate main Pages and public browser smoke. Source/QA repair does not certify long-run site economy or full 15-world AAA authorship.


### 2026-10-13 — Preserve complete public browser coverage (PR #17)
- Public smoke for PR #16 merge was cancelled **twice** at exactly 617 seconds/job. Re-run #2 passed 17 browser journeys before the 10-minute total job deadline killed the software-rendered run. Validation and Pages deployment had passed; this was incomplete public proof, not evidence that those journeys failed.
- PR #17 changes **only** `.github/workflows/deploy.yml` public-smoke job timeout from 10 to 20 minutes (in addition to separate service planner fixes). All 20 Playwright tests, same live Pages URL and exact commit identity gate remain mandatory. Do not relax required smoke assertions to fit a timeout; extend the total job budget to match measured runtime.
- State: candidate until PR-head and postmerge GitHub Actions validate/deploy/public-smoke receipts are separately verified. Ledger: `docs/acceptance/RECURSIVE_SERVICE_BUG_SWEEP_2026-10-13.md`.

## 2026-10-13 — Real science plus paid expedition servicing must be proven together

- Production baseline PR #17 released and public-smoked at merge `8f4e3569`, 24/24 browser tests ([run 38400343670](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38400343670)). Prior PR #14-16 continuity entries marked candidate are historical at their authored timestamps.
- New `arena/closed-loop-recovery-sustainment-20261013` candidate is a three-arm 180-tick matched acceptance lab: unattended native simulation, native science only, and the exact same science followed by the existing finite paid in-world service planner/command bus. Use real initial 36-visited-site, default-stock, tick-2005 runs in four worlds × three seeds.
- Protected invariants: 2 supplies per repair, actual finite stock transfers, route fuel debit, hazard cap 70, tick-driven travel, historical ZIP/oracle and branch/save determinism. Do not replace quantitative observations with a sustainability claim. Native scientific emergency commands do not have a global economic budget; the branch is evidence-only.
- Procedure and decision boundary: `docs/acceptance/CLOSED_LOOP_SUSTAINMENT_LAB.md`. New treatment results, CI, merge and deployment are PENDING until tool receipts verify them.

## 2026-10-13 — Science plus paid service works locally; global recovery still incomplete

- In PR #18's verified-source [CI 38460671911](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38460671911), twelve matched 3-arm simulations over +180 ticks proved that combining already-authored scientific intervention with finite native service orders improves site condition versus science alone, without altering simulation plugins, archives or route rules. Civilization v2 +2.083 mean, Industrial +42.143, Megacity +41.105–43.897, Geology +47.759–48.462 points.
- Not a sustainability certificate: 11–20 sites remain severely damaged in three worlds; Megacity seed 2026 safe access worsens by four sites versus science-only; zero active resupplies exercised the finite-stock transfer path; native scientific rescue commands are uncosted. Real indefinite/world-wide equilibrium and gameplay budget remain OPEN.
- Evidence source: `docs/acceptance/CLOSED_LOOP_SUSTAINMENT_LAB.md`; controls stayed authoritative `planFieldService`, `exploration.action` and `expedition.resupply`. Strict test-side floating precision repair did not touch gameplay arithmetic. Before public promotion of the appended receipt, exact documentation-head CI and post-merge deploy remain to be verified.

## 2026-10-14 — Visual-only known-site compass and evidence-driven beacon identity (candidate)

- Public rollback/reference remains main `7e792b3d4` verified by [run 38648271565](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38648271565). PR #19 is a separate pending route-vantage/resource diagnostic and is not a merge prerequisite for this strictly front-end branch.
- Feature branch `arena/immersive-wayfinding-visible-service-20261014`: `src/exploration/fieldWayfinding.ts` adds pure waypoint filtering/ranking, yaw-correct relative bearings and visible-only site condition classifications; `ImmersiveWorldView.tsx` adds optional next-site/free-explore controls and drives landmark material colors from the latest authoritative Atlas projection.
- Purpose: correct the existing 3D walk-and-inspect loop's absence of navigational bearing while visually reflecting what actual repairs changed. No target button bypasses native travel, fuel, risk, discovery, supplies or simulation ticks. No hidden site is promoted into navigation. Existing scene-owned textures/materials and single RAF lifecycle stay in charge.
- Unit `src/test/fieldWayfinding.test.ts` protects fifteen-world projection, no state-hash mutation, world-space heading orientation and hidden-site semantics; `e2e/immersive.spec.ts` additionally requires real browser guide buttons and a native paid two-repair beacon transition. Protocol: `docs/acceptance/FIELD_BEARING_AND_NATIVE_BEACONS.md`.
- Candidate on authoring, **not yet typecheck/lint/unit/browser/CI/PAGES verified**. If a Playwright repair interaction test fails, preserve its real command receipt and keep simulation contract unchanged; fix a view/test issue narrowly. Hardware GPU FPS remains unverified. Next action: exact-head full CI and reviewed PR; no production merge or claim until strong independent release evidence.
