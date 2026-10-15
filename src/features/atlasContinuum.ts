/**
 * The Atlas-to-World Continuum (P008)
 *
 * Implements identity-preserving multi-scale navigation across four distinct viewport levels:
 * universe -> region -> site -> field.
 *
 * Enforces canonical resolution, boundary clamping, persistent site disclosure gating
 * (ensuring no identity leakage for undiscovered sites), and travel transit verification
 * (camera zoom changes view scale but cannot bypass route travel, fuel, or ticks).
 */

export type ViewScale = 'universe' | 'region' | 'site' | 'field';

export const VIEW_SCALES: readonly ViewScale[] = ['universe', 'region', 'site', 'field'] as const;
export const SCALE_ORDER: readonly ViewScale[] = VIEW_SCALES;

export const SCALE_LEVELS: Record<ViewScale, number> = {
  universe: 0,
  region: 1,
  site: 2,
  field: 3,
};

const SCALE_FACTORS: Record<ViewScale, number> = {
  universe: 1,
  region: 10,
  site: 100,
  field: 1000,
};

export type DiscoveryStage =
  | 'UNKNOWN'
  | 'DETECTED'
  | 'SURVEYED'
  | 'DISCOVERED'
  | 'VISITED'
  | 'INVESTIGATED'
  | 'RESOLVED';

export interface NavigationSite {
  readonly id: string;
  readonly worldId: string;
  readonly regionId: string;
  readonly name: string;
  readonly description: string;
  readonly coordinates: { x: number; y: number; z?: number } | readonly [number, number, number];
  isDisclosed?: boolean;
  dangerLevel?: number;
}

export interface NavigationRoute {
  readonly id: string;
  readonly fromRegionId: string;
  readonly toRegionId: string;
  readonly distanceKm?: number;
  readonly fuelCost: number;
  readonly travelTicks: number;
  readonly hazardRating?: number;
  readonly blocked?: boolean;
}

export interface ContinuumNavigationState {
  readonly worldId: string;
  readonly scale: ViewScale;
  readonly selectedRegionId?: string;
  readonly selectedSiteId?: string;
  readonly discoveryStage?: DiscoveryStage;
  readonly cameraPosition: readonly [number, number, number];
  readonly zoomFactor: number;
}

export interface ResolvedSitePresentation {
  readonly id: string;
  readonly regionId: string;
  readonly worldId: string;
  readonly displayName: string;
  readonly displayDescription: string;
  readonly coordinates: readonly [number, number, number];
  readonly discoveryStage: DiscoveryStage;
  readonly isDisclosed: boolean;
  readonly isExactIdentityRevealed: boolean;
}

export interface TransitLegalityCheck {
  readonly legal: boolean;
  readonly travelTicks: number;
  readonly fuelCost: number;
  readonly reason?: string;
}

export interface RouteEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly travelTicks: number;
  readonly fuel: number;
  readonly blocked?: boolean;
}

export class AtlasContinuumNavigator {
  readonly worldId: string;
  private currentScale: ViewScale = 'universe';
  private activeRegionId?: string;
  private activeSiteId?: string;
  private readonly routes: Map<string, RouteEdge> = new Map();
  private readonly sitesMap: Map<string, NavigationSite> = new Map();
  private readonly siteDisclosures: Map<string, DiscoveryStage> = new Map();

  constructor(
    worldId: string,
    initialSites?: readonly NavigationSite[],
    initialRoutes?: readonly (RouteEdge | NavigationRoute)[],
  ) {
    this.worldId = worldId;
    if (initialSites) {
      for (const site of initialSites) {
        this.registerSite(site);
      }
    }
    if (initialRoutes) {
      for (const route of initialRoutes) {
        this.registerRoute(route);
      }
    }
  }

  registerSite(site: NavigationSite): void {
    this.sitesMap.set(site.id, { ...site });
    this.siteDisclosures.set(site.id, site.isDisclosed ? 'DISCOVERED' : 'UNKNOWN');
  }

  discloseSite(siteId: string): void {
    const site = this.sitesMap.get(siteId);
    if (site) {
      site.isDisclosed = true;
    }
    this.siteDisclosures.set(siteId, 'DISCOVERED');
  }

  getVisibleSites(): readonly NavigationSite[] {
    const results: NavigationSite[] = [];
    for (const site of this.sitesMap.values()) {
      const stage = this.siteDisclosures.get(site.id) ?? (site.isDisclosed ? 'DISCOVERED' : 'UNKNOWN');
      const disclosed = stage !== 'UNKNOWN' && site.isDisclosed !== false;
      if (disclosed) {
        results.push({ ...site, isDisclosed: true });
      } else {
        results.push({
          ...site,
          name: 'Unmapped Sector',
          description: 'Survey required to disclose telemetry.',
          isDisclosed: false,
          dangerLevel: 0,
        });
      }
    }
    return results;
  }

  registerRoute(route: RouteEdge | NavigationRoute): void {
    if ('from' in route && 'to' in route) {
      this.routes.set(route.id, {
        id: route.id,
        from: route.from,
        to: route.to,
        travelTicks: route.travelTicks,
        fuel: route.fuel,
        blocked: route.blocked ?? false,
      });
    } else {
      this.routes.set(route.id, {
        id: route.id,
        from: route.fromRegionId,
        to: route.toRegionId,
        travelTicks: route.travelTicks,
        fuel: route.fuelCost,
        blocked: route.blocked ?? false,
      });
    }
  }

  setSiteDiscoveryStage(siteId: string, stage: DiscoveryStage): void {
    this.siteDisclosures.set(siteId, stage);
    const site = this.sitesMap.get(siteId);
    if (site) {
      site.isDisclosed = stage !== 'UNKNOWN';
    }
  }

  getSiteDiscoveryStage(siteId: string): DiscoveryStage {
    return this.siteDisclosures.get(siteId) ?? 'UNKNOWN';
  }

  getCurrentScale(): ViewScale {
    return this.currentScale;
  }

  getActiveRegion(): string | undefined {
    return this.activeRegionId;
  }

  getActiveSite(): string | undefined {
    return this.activeSiteId;
  }

  /**
   * Transitions view scale with strict boundary clamping.
   * Zooming alone never changes actual expedition position or bypasses route travel.
   */
  zoomIn(): ViewScale {
    const currentLvl = SCALE_LEVELS[this.currentScale];
    if (currentLvl < 3) {
      const nextScale = VIEW_SCALES[currentLvl + 1];
      this.currentScale = nextScale;
    }
    return this.currentScale;
  }

  zoomOut(): ViewScale {
    const currentLvl = SCALE_LEVELS[this.currentScale];
    if (currentLvl > 0) {
      const prevScale = VIEW_SCALES[currentLvl - 1];
      this.currentScale = prevScale;
      if (this.currentScale === 'universe') {
        this.activeSiteId = undefined;
        this.activeRegionId = undefined;
      } else if (this.currentScale === 'region') {
        this.activeSiteId = undefined;
      }
    }
    return this.currentScale;
  }

  setScale(scale: ViewScale): void {
    this.currentScale = scale;
  }

  selectRegion(regionId: string): void {
    this.activeRegionId = regionId;
    if (SCALE_LEVELS[this.currentScale] < SCALE_LEVELS.region) {
      this.currentScale = 'region';
    }
  }

  selectSite(siteId: string, regionId?: string): void {
    this.activeSiteId = siteId;
    if (regionId) {
      this.activeRegionId = regionId;
    }
    if (SCALE_LEVELS[this.currentScale] < SCALE_LEVELS.site) {
      this.currentScale = 'site';
    }
  }

  /**
   * Resolves site presentation, strictly redacting identity for undiscovered sites.
   */
  resolveSite(
    siteFacts: {
      id: string;
      worldId: string;
      regionId: string;
      name: string;
      description: string;
      coordinates: readonly [number, number, number];
    },
  ): ResolvedSitePresentation {
    const stage = this.getSiteDiscoveryStage(siteFacts.id);
    const isDisclosed = stage !== 'UNKNOWN';
    const isExactIdentityRevealed = stage === 'SURVEYED' || stage === 'DISCOVERED' || stage === 'VISITED' || stage === 'INVESTIGATED' || stage === 'RESOLVED';

    if (!isDisclosed) {
      return {
        id: siteFacts.id,
        regionId: siteFacts.regionId,
        worldId: siteFacts.worldId,
        displayName: 'Unidentified Signal Anomaly',
        displayDescription: 'Telemetry signature detected in this sector. Requires local survey or sensor focus to resolve.',
        coordinates: siteFacts.coordinates,
        discoveryStage: 'UNKNOWN',
        isDisclosed: false,
        isExactIdentityRevealed: false,
      };
    }

    if (!isExactIdentityRevealed) {
      return {
        id: siteFacts.id,
        regionId: siteFacts.regionId,
        worldId: siteFacts.worldId,
        displayName: `Contact ${siteFacts.id}`,
        displayDescription: 'Unsurveyed installation footprint. Physical survey required to catalog structure role and resources.',
        coordinates: siteFacts.coordinates,
        discoveryStage: stage,
        isDisclosed: true,
        isExactIdentityRevealed: false,
      };
    }

    return {
      id: siteFacts.id,
      regionId: siteFacts.regionId,
      worldId: siteFacts.worldId,
      displayName: siteFacts.name,
      displayDescription: siteFacts.description,
      coordinates: siteFacts.coordinates,
      discoveryStage: stage,
      isDisclosed: true,
      isExactIdentityRevealed: true,
    };
  }

  /**
   * Verifies whether transit between two regions/sites is legal under network routes.
   * Zooming presentation does not grant transit; only legal routes with fuel/ticks allow travel.
   */
  verifyTransit(
    fromRegionId: string,
    toRegionId: string,
    availableFuel: number,
  ): TransitLegalityCheck {
    if (fromRegionId === toRegionId) {
      return { legal: true, travelTicks: 0, fuelCost: 0 };
    }

    // Direct route check
    for (const route of this.routes.values()) {
      if (
        (route.from === fromRegionId && route.to === toRegionId) ||
        (route.from === toRegionId && route.to === fromRegionId)
      ) {
        if (route.blocked) {
          return {
            legal: false,
            travelTicks: route.travelTicks,
            fuelCost: route.fuel,
            reason: `Route between ${fromRegionId} and ${toRegionId} is currently blocked.`,
          };
        }
        if (availableFuel < route.fuel) {
          return {
            legal: false,
            travelTicks: route.travelTicks,
            fuelCost: route.fuel,
            reason: `Insufficient fuel for transit: need ${route.fuel}, have ${availableFuel}.`,
          };
        }
        return {
          legal: true,
          travelTicks: route.travelTicks,
          fuelCost: route.fuel,
        };
      }
    }

    return {
      legal: false,
      travelTicks: 0,
      fuelCost: 0,
      reason: `No charted route between region ${fromRegionId} and ${toRegionId}.`,
    };
  }

  /**
   * Converts 2D coordinates between zoom scales.
   */
  convertCoordinates(
    coords: { x: number; y: number },
    fromScale: ViewScale,
    toScale: ViewScale,
  ): { x: number; y: number } {
    const factorFrom = SCALE_FACTORS[fromScale];
    const factorTo = SCALE_FACTORS[toScale];
    const multiplier = factorTo / factorFrom;
    return {
      x: Math.round(coords.x * multiplier * 10000) / 10000,
      y: Math.round(coords.y * multiplier * 10000) / 10000,
    };
  }

  /**
   * Computes multi-scale coordinate conversion across zoom levels.
   */
  computeMultiScaleCoords(
    worldCoords: readonly [number, number, number],
    scale: ViewScale,
  ): readonly [number, number, number] {
    switch (scale) {
      case 'universe':
        return [worldCoords[0] * 0.1, worldCoords[1] * 0.1, worldCoords[2] * 0.1];
      case 'region':
        return [worldCoords[0] * 0.5, worldCoords[1] * 0.5, worldCoords[2] * 0.5];
      case 'site':
        return [worldCoords[0], worldCoords[1], worldCoords[2]];
      case 'field':
        return [worldCoords[0] * 2.0, worldCoords[1] * 2.0, worldCoords[2] * 2.0];
    }
  }
}
