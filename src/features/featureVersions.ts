/**
 * Canonical feature and rules versions for the Omniverse engine.
 */

export const LEGACY_RULES_VERSION = 0;
export const OMNIVERSE_III_RULES_VERSION = 1;

/**
 * Checks whether the given configuration dictionary has explicitly opted into Omniverse III rules.
 */
export function isOmniverseIIIRules(config: unknown): boolean {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  return (
    c.worldRulesVersion === OMNIVERSE_III_RULES_VERSION ||
    c.rulesVersion === OMNIVERSE_III_RULES_VERSION
  );
}

/**
 * Extracts the rules version integer from configuration safely, defaulting to legacy (0).
 */
export function getRulesVersion(config: unknown): number {
  if (!config || typeof config !== 'object') return LEGACY_RULES_VERSION;
  const c = config as Record<string, unknown>;
  const v = c.worldRulesVersion ?? c.rulesVersion;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
    return v;
  }
  return LEGACY_RULES_VERSION;
}
