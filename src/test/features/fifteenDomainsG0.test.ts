import { describe, expect, it } from 'vitest';
import { globalFeatureRegistry } from '../../features/registry';
import {
  ALL_DOMAIN_FEATURE_MODULES,
  registerAllDomainFeatureModules,
} from '../../features/domainModules';
import { CORE_WORLD_PLUGINS } from '../../worlds';
import { SimulationKernel } from '../../core/kernel';
import { isOmniverseIIIRules } from '../../features/featureVersions';

describe('Omniverse III Fifteen-World Integration Contracts (Gate G0 Checkpoint B)', () => {
  const EXPECTED_WORLDS = [
    'ecosystem',
    'station',
    'civilization',
    'atmosphere',
    'ocean',
    'celestial',
    'megacity',
    'industrial',
    'geology',
    'wild-meridian',
    'hollow-deep',
    'timeworn-empire',
    'terraforming-frontier',
    'machine-wilderness',
    'signal-expanse',
  ] as const;

  it('verifies all 15 canonical worlds are registered in globalFeatureRegistry with rulesVersion=1', () => {
    registerAllDomainFeatureModules(globalFeatureRegistry);

    expect(ALL_DOMAIN_FEATURE_MODULES).toHaveLength(15);

    for (const worldId of EXPECTED_WORLDS) {
      expect(globalFeatureRegistry.has(worldId, 1)).toBe(true);
      const mod = globalFeatureRegistry.get(worldId, 1);
      expect(mod).toBeDefined();
      expect(mod?.worldId).toBe(worldId);
      expect(mod?.rulesVersion).toBe(1);

      // Verify capabilities
      const caps = globalFeatureRegistry.getCapabilities(worldId, 1);
      expect(caps.length).toBeGreaterThanOrEqual(6);

      // Verify 3 distinct P001 action families
      const p001Caps = caps.filter((c) => c.featureId === 'P001');
      expect(p001Caps).toHaveLength(3);
      const actionIds = new Set(p001Caps.map((c) => c.id));
      expect(actionIds.size).toBe(3);

      // Verify P002 hazard capability
      const p002Caps = caps.filter((c) => c.featureId === 'P002');
      expect(p002Caps).toHaveLength(1);

      // Verify P003 conservation ledger capability
      const p003Caps = caps.filter((c) => c.featureId === 'P003');
      expect(p003Caps).toHaveLength(1);

      // Verify P011 signature destination capability
      const p011Caps = caps.filter((c) => c.featureId === 'P011');
      expect(p011Caps.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('validates action envelopes and rejects invalid or cross-world capabilities across all 15 domains', () => {
    for (const mod of ALL_DOMAIN_FEATURE_MODULES) {
      const state = {};

      // 1. Rejects malformed payload
      const malformed = mod.validateAction(null, state);
      expect(malformed.valid).toBe(false);

      // 2. Rejects capability from an alien world
      const alienCap = mod.validateAction(
        { capabilityId: 'alien_world.invalid_action' },
        state,
      );
      expect(alienCap.valid).toBe(false);
      expect(alienCap.error).toMatch(/not supported on world/i);

      // 3. Validates each advertised capability
      for (const cap of mod.capabilities) {
        const validRes = mod.validateAction(
          { capabilityId: cap.id, payload: { note: 'test' } },
          state,
        );
        expect(validRes.valid).toBe(true);
        expect(validRes.action).toBeDefined();
        expect(validRes.action?.worldId).toBe(mod.worldId);
        expect(validRes.action?.capabilityId).toBe(cap.id);
      }
    }
  });

  it('proves zero-impact hash identity on legacy runs across all 15 worlds', () => {
    expect(CORE_WORLD_PLUGINS).toHaveLength(15);

    for (const plugin of CORE_WORLD_PLUGINS) {
      // Create a default legacy simulation run
      const kernel = new SimulationKernel({
        runId: `legacy-parity-${plugin.id}`,
        name: `Legacy Parity ${plugin.id}`,
        plugin,
        seed: 424242,
      });

      // Confirm legacy rules version is inactive
      expect(isOmniverseIIIRules(kernel.getConfig())).toBe(false);

      // Step simulation 10 ticks
      for (let i = 0; i < 10; i++) {
        kernel.step();
      }

      const hashAt10 = kernel.getStateHash();
      expect(typeof hashAt10).toBe('string');
      expect(hashAt10).toHaveLength(16);

      // Take a checkpoint snapshot
      const cp = kernel.createCheckpoint('cp-10');
      expect(cp.stateHash).toBe(hashAt10);

      // Step another 5 ticks
      for (let i = 0; i < 5; i++) {
        kernel.step();
      }

      // Restore from checkpoint
      kernel.restoreCheckpoint(cp.id);
      expect(kernel.getStateHash()).toBe(hashAt10);
      expect(kernel.tick).toBe(10);
    }
  });
});
