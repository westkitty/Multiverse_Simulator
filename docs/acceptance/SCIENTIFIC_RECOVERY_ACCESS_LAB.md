# Long-run scientific restoration and access — paired experiment

**Baseline:** verified PR #12 merge `6f05cb05f1f922fc43c9921f674f021580f9edc2`, full GitHub Pages release [38328127781](https://github.com/westkitty/Multiverse_Simulator/actions/runs/38328127781).

## Question

The prior matched maintenance trial proves repairs can raise *local site integrity* but not the long-term economy. Civilization finished at 4.952/100 condition with no repair travel, Industrial at 2.532/100, Megacity at 22.088–22.664/100 and Geology at 11.631–17.838/100. Can existing native scientific restoration commands reopen unsafe regions or route access, without relaxed navigation rules?

## Experimental method

- Exactly four historically vulnerable native worlds: Civilization, Industrial, Megacity and Geology; three fixed seeds: 1, 2026, 424242.
- Reuse the same 36-site default-stock nearest-first completed expedition and **unattended native state at tick 2005** from the existing acceptance test. Clone through the real serialized run record into two hash-identical authoritative control and treatment runs.
- Treatment sends **two ordinary production commands on consecutive ticks**. Control receives none. Both advance the same fixed simulation steps, with snapshots after two and thirty ticks.
- Commands by their existing plugin-owned quick-intervention IDs: Civilization `civ-civic-festival-stabilization` (`convene_civic_jubilee`); Industrial `ind-repair-all-facilities` (`repair_facility_breakdowns`); Megacity `cty-infrastructure-overhaul` (`overhaul_city_infrastructure`); Geology `geo-emergency-reconstruction` (`reinforce_vulnerable_areas`).
- At each observation capture mean native regional hazard; regions with hazard above 70; hazardous destination sites; safely reachable sites with the expedition's real fuel budget and native route graph; routes blocked specifically by hazard, fuel or closed/disconnected passages; and site mean condition.
- Classify actual access through the production `planRoute` under its **existing 70-hazard threshold**. Diagnostic alternative calls with hazard 100 and/or unlimited fuel **do not travel, mutate gameplay, or relax gameplay rules**; they only identify the limiting constraint.
- Require the original commands to be accepted and a positive **immediate native regional-hazard reduction** versus the identical control. Do not assert improved travel before measuring: routes may remain closed, supplies may be scarce, or site hazards can still block the target.
- Validate treatment save/restore identity and five further ticks. Emit a machine-readable diagnostic report under `docs/acceptance/scientific-recovery-access.json` and twelve `SCIENTIFIC_RECOVERY` CI log receipts.

## Authority and proof limits

This is an acceptance-only, read/experiment change in `src/test/`; it does not alter kernel code, original scientific plugins, world parameters, RNG, blocked routes, fuel/supplies, renderer, UI, historical archives, save schemas, CI performance limits, or production permissions. The two existing native commands are **not assumed to have resource/opportunity costs beyond their current implementation**. A short-term hazard/route improvement cannot certify a sustainable player economy, long-term recovery or preservation of meaningful independent mechanics. Any balancing adjustment requires a subsequent isolated, justified, validated change.

**Evidence state on authoring:** PR-head CI, measured access outcomes, merge and release **PENDING**. Treat this document as a method contract until exact-head test evidence exists.
