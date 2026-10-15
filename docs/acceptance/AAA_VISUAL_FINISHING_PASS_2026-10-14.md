# AAA visual finishing pass — 2026-10-14

## Baseline and scope
- Project: westkitty/Multiverse_Simulator, existing full 15-world native simulation. Visual uplift based on PR #20 (f535d06), on isolated BigMac branch visual/aaa-art-direction-20261014. Main remains unchanged.
- Existing first-person Three.js world and the native Atlas, science, replay, history, exploration, sites, resources, and command bus are protected. Zero new production dependencies or unlicensed assets.

## Art direction implemented
- Unified stylized field-reconnaissance system across distinct existing native world profiles. World palettes, celestial bodies, terrain types, and native architecture identities remain distinct.
- Introduced renderer-owned instanced contact shadows, structural motif silhouettes, model trim, per-site facade accents, and natural world-specific small details. Background city and settlement skyline gain one batched instanced illuminated-window layer.
- Terrain receives per-vertex macro-strata tinting on its existing 40-segment single mesh. Lighting gains restrained world-specific rim and dark-scene fill. No expensive shadow maps or bloom postprocessing.
- Environmental motes use one fixed typed-array THREE.Points buffer, throttled to ~10Hz; 96 full, 36 lite, zero reduced-motion. One original animation loop and existing rendering context.
- HUD and controls polished in scope, responsive on 390px, legible reticle, native full-screen toggle, 44px keyboard/touch targets. First-person gameplay moved above optional research panels; those tools remain intact.
- Alternate 3D observatory renderer now adopts each world's palette on world change while keeping high-contrast mode.

## Performance and ownership policy
- Quality tier selected using viewport, DPR and hardware hints, without affecting native gameplay or simulation. Full DPR capped 1.45, lite DPR 1.
- Instancing batches added details into a handful of draw submissions. Geometry/material ownership stays with original scene and deterministic unmount cleanup. No third-party runtime assets.
- Renderer draw calls are measurable but alone cannot certify FPS, GPU memory, battery consumption, or thermals.

## Test contract
- Required: TypeScript, ESLint, full unit suite after pinned history fixtures, historical archive and 15-world acceptance, performance budget, production build/dist verification.
- All-world rendered view: scripts/qa-visual-capture.mjs with A-O Chromium desktop SwiftShader at 1280x900 DPR1. Match exact same build, record drawCalls, artMotifs, facadeDetails, artTier, errors and screenshots for every world.
- Browser gameplay: all first-person worlds, movement, destination visit and paid repairs, keyboard and touch controls, mobile tier, live WebGL draw submissions, science interactions, native fullscreen, return Atlas, context loss when supported.
- Unit: src/test/immersiveArtPass.test.ts verifies all-world projection and no changes to authoritative world hashes, renderer complexity and lite/reduced motion.
- Save and scientific-state semantics unchanged. No production claim or deployment without tests and user instruction.

## Evidence boundary
- Source-based implementation and screenshots are not proof of a bespoke AAA art-asset production pipeline. This project intentionally remains stylized procedural geometry.
- Software-rendered desktop/browser visual correctness can be checked here. Physical mobile thermal and GPU performance remain unverified until tested on hardware.
- Runtime validation results and delivery commit should be appended after independent checks; do not invent success.
