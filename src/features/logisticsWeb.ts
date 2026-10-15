export type CourierCarrierType =
  | 'ground_rover'
  | 'sky_drone'
  | 'sub_crawler'
  | 'orbital_pod'
  | 'crawler_train'
  | 'field_hauler';

export interface DepotState {
  readonly siteId: string;
  readonly capacity: number;
  inventory: Record<string, number>;
  reservedOutbound: Record<string, number>;
  reservedInbound: Record<string, number>;
}

export interface CourierState {
  readonly id: string;
  readonly name: string;
  readonly carrierType: CourierCarrierType;
  readonly capacity: number;
  readonly speed: number; // hops or ticks factor
  location: string; // siteId
  currentCargo: Record<string, number>;
  status: 'idle' | 'in_transit' | 'maintenance' | 'stranded';
  condition: number; // 0 to 100
  fuel: number;
  activeOrderId?: string;
}

export interface ShipmentOrder {
  readonly id: string;
  readonly worldId: string;
  readonly sourceSiteId: string;
  readonly destSiteId: string;
  readonly cargo: Record<string, number>;
  courierId?: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'aborted' | 'failed';
  departureTick?: number;
  arrivalTick?: number;
  route: string[]; // sequence of site IDs
  routeIndex: number;
  transitTicksRemaining: number;
  failureReason?: string;
}

export interface LogisticsRouteEdge {
  fromSiteId: string;
  toSiteId: string;
  travelTicks: number;
  fuelCost: number;
  blocked?: boolean;
}

export interface InventoryConservationReport {
  conserved: boolean;
  discrepancies: Record<string, { expected: number; actual: number; delta: number }>;
}

export class LogisticsNetwork {
  readonly worldId: string;
  readonly depots = new Map<string, DepotState>();
  readonly couriers = new Map<string, CourierState>();
  readonly orders = new Map<string, ShipmentOrder>();
  readonly routes: LogisticsRouteEdge[] = [];
  readonly cumulativeProduced: Record<string, number> = {};
  readonly cumulativeConsumed: Record<string, number> = {};

  constructor(worldId: string) {
    this.worldId = worldId;
  }

  createDepot(
    siteId: string,
    capacity: number,
    initialInventory: Record<string, number> = {},
  ): DepotState {
    const inv: Record<string, number> = {};
    for (const [k, v] of Object.entries(initialInventory)) {
      inv[k] = Math.max(0, v);
    }
    const depot: DepotState = {
      siteId,
      capacity,
      inventory: inv,
      reservedOutbound: {},
      reservedInbound: {},
    };
    this.depots.set(siteId, depot);
    return depot;
  }

  addRouteEdge(edge: LogisticsRouteEdge): void {
    this.routes.push({ ...edge });
  }

  registerCourier(courier: CourierState): void {
    this.couriers.set(courier.id, {
      ...courier,
      currentCargo: { ...courier.currentCargo },
    });
  }

  getDepotStock(siteId: string, resource: string): number {
    const depot = this.depots.get(siteId);
    return depot?.inventory[resource] ?? 0;
  }

  getDepotAvailableStock(siteId: string, resource: string): number {
    const depot = this.depots.get(siteId);
    if (!depot) return 0;
    const current = depot.inventory[resource] ?? 0;
    const reserved = depot.reservedOutbound[resource] ?? 0;
    return Math.max(0, current - reserved);
  }

  getDepotFreeCapacity(siteId: string): number {
    const depot = this.depots.get(siteId);
    if (!depot) return 0;
    let totalStored = 0;
    for (const count of Object.values(depot.inventory)) {
      totalStored += count;
    }
    for (const count of Object.values(depot.reservedInbound)) {
      totalStored += count;
    }
    return Math.max(0, depot.capacity - totalStored);
  }

  createShipmentOrder(
    orderId: string,
    sourceSiteId: string,
    destSiteId: string,
    cargo: Record<string, number>,
    route: string[] = [],
  ): { success: boolean; order?: ShipmentOrder; reason?: string } {
    if (this.orders.has(orderId)) {
      return { success: false, reason: `Order ${orderId} already exists` };
    }
    const sourceDepot = this.depots.get(sourceSiteId);
    if (!sourceDepot) {
      return { success: false, reason: `Source depot ${sourceSiteId} not found` };
    }
    const destDepot = this.depots.get(destSiteId);
    if (!destDepot) {
      return { success: false, reason: `Destination depot ${destSiteId} not found` };
    }

    // Check cargo amounts
    let totalCargoWeight = 0;
    for (const [res, amount] of Object.entries(cargo)) {
      if (amount <= 0) continue;
      totalCargoWeight += amount;
      const available = this.getDepotAvailableStock(sourceSiteId, res);
      if (available < amount) {
        return {
          success: false,
          reason: `Insufficient available ${res} at source: have ${available}, need ${amount}`,
        };
      }
    }

    if (totalCargoWeight <= 0) {
      return { success: false, reason: 'Empty cargo requested' };
    }

    // Check destination capacity
    const destFree = this.getDepotFreeCapacity(destSiteId);
    if (destFree < totalCargoWeight) {
      return {
        success: false,
        reason: `Insufficient capacity at destination depot: free ${destFree}, needed ${totalCargoWeight}`,
      };
    }

    // Reserve outbound on source and inbound on dest
    for (const [res, amount] of Object.entries(cargo)) {
      sourceDepot.reservedOutbound[res] = (sourceDepot.reservedOutbound[res] ?? 0) + amount;
      destDepot.reservedInbound[res] = (destDepot.reservedInbound[res] ?? 0) + amount;
    }

    // Default route if empty
    const actualRoute = route.length > 0 ? route : [sourceSiteId, destSiteId];

    // Compute route transit ticks
    let transitTicks = 0;
    for (let i = 0; i < actualRoute.length - 1; i++) {
      const from = actualRoute[i];
      const to = actualRoute[i + 1];
      const edge = this.routes.find(
        (r) => (r.fromSiteId === from && r.toSiteId === to) || (r.fromSiteId === to && r.toSiteId === from),
      );
      transitTicks += edge?.travelTicks ?? 3;
    }
    if (transitTicks === 0) transitTicks = 3;

    const order: ShipmentOrder = {
      id: orderId,
      worldId: this.worldId,
      sourceSiteId,
      destSiteId,
      cargo: { ...cargo },
      status: 'pending',
      route: actualRoute,
      routeIndex: 0,
      transitTicksRemaining: transitTicks,
    };

    this.orders.set(orderId, order);
    return { success: true, order };
  }

  dispatchOrder(
    orderId: string,
    courierId: string,
    tick: number,
  ): { success: boolean; reason?: string } {
    const order = this.orders.get(orderId);
    if (!order) return { success: false, reason: `Order ${orderId} not found` };
    if (order.status !== 'pending') {
      return { success: false, reason: `Order status is ${order.status}, expected pending` };
    }

    const courier = this.couriers.get(courierId);
    if (!courier) return { success: false, reason: `Courier ${courierId} not found` };
    if (courier.status !== 'idle') {
      return { success: false, reason: `Courier ${courierId} is ${courier.status}` };
    }
    if (courier.location !== order.sourceSiteId) {
      return {
        success: false,
        reason: `Courier located at ${courier.location}, but source is ${order.sourceSiteId}`,
      };
    }

    let cargoWeight = 0;
    for (const amount of Object.values(order.cargo)) {
      cargoWeight += amount;
    }
    if (cargoWeight > courier.capacity) {
      return {
        success: false,
        reason: `Cargo weight ${cargoWeight} exceeds courier capacity ${courier.capacity}`,
      };
    }

    const sourceDepot = this.depots.get(order.sourceSiteId);
    if (!sourceDepot) return { success: false, reason: 'Source depot missing' };

    // Strict physical custody transfer: deduct from source depot inventory & outbound reservation
    for (const [res, amount] of Object.entries(order.cargo)) {
      sourceDepot.inventory[res] = Math.max(0, (sourceDepot.inventory[res] ?? 0) - amount);
      sourceDepot.reservedOutbound[res] = Math.max(0, (sourceDepot.reservedOutbound[res] ?? 0) - amount);
      courier.currentCargo[res] = (courier.currentCargo[res] ?? 0) + amount;
    }

    courier.status = 'in_transit';
    courier.activeOrderId = order.id;

    order.courierId = courier.id;
    order.status = 'in_transit';
    order.departureTick = tick;

    return { success: true };
  }

  stepNetwork(
    tick: number,
    options: {
      blockedEdges?: Array<[string, string]>;
    } = {},
  ): { deliveredOrders: string[]; abortedOrders: string[] } {
    const deliveredOrders: string[] = [];
    const abortedOrders: string[] = [];

    for (const order of this.orders.values()) {
      if (order.status !== 'in_transit' || !order.courierId) continue;

      const courier = this.couriers.get(order.courierId);
      if (!courier) continue;

      // Check current route segment blockage
      const currentHopFrom = order.route[order.routeIndex] ?? order.sourceSiteId;
      const currentHopTo = order.route[order.routeIndex + 1] ?? order.destSiteId;
      const isBlocked = options.blockedEdges?.some(
        ([a, b]) => (a === currentHopFrom && b === currentHopTo) || (a === currentHopTo && b === currentHopFrom),
      );

      if (isBlocked) {
        // Route interrupted: courier aborts and returns custody to source
        order.status = 'aborted';
        order.failureReason = `Route blocked between ${currentHopFrom} and ${currentHopTo}`;
        abortedOrders.push(order.id);

        // Clear dest reservation
        const destDepot = this.depots.get(order.destSiteId);
        if (destDepot) {
          for (const [res, amount] of Object.entries(order.cargo)) {
            destDepot.reservedInbound[res] = Math.max(0, (destDepot.reservedInbound[res] ?? 0) - amount);
          }
        }

        // Return cargo to source depot inventory
        const sourceDepot = this.depots.get(order.sourceSiteId);
        if (sourceDepot) {
          for (const [res, amount] of Object.entries(courier.currentCargo)) {
            sourceDepot.inventory[res] = (sourceDepot.inventory[res] ?? 0) + amount;
          }
        }
        courier.currentCargo = {};
        courier.status = 'idle';
        courier.activeOrderId = undefined;
        courier.location = order.sourceSiteId;
        continue;
      }

      // Check fuel
      if (courier.fuel <= 0) {
        courier.status = 'stranded';
        order.status = 'failed';
        order.failureReason = 'Courier ran out of fuel in transit';
        continue;
      }

      // Advance transit
      order.transitTicksRemaining = Math.max(0, order.transitTicksRemaining - 1);
      courier.condition = Math.max(0, Math.round((courier.condition - 0.2) * 100) / 100);
      courier.fuel = Math.max(0, courier.fuel - 1);

      // Check arrival
      if (order.transitTicksRemaining <= 0) {
        const destDepot = this.depots.get(order.destSiteId);
        if (destDepot) {
          for (const [res, amount] of Object.entries(courier.currentCargo)) {
            destDepot.inventory[res] = (destDepot.inventory[res] ?? 0) + amount;
            destDepot.reservedInbound[res] = Math.max(0, (destDepot.reservedInbound[res] ?? 0) - amount);
          }
        }
        courier.currentCargo = {};
        courier.status = 'idle';
        courier.activeOrderId = undefined;
        courier.location = order.destSiteId;

        order.status = 'delivered';
        order.arrivalTick = tick;
        deliveredOrders.push(order.id);
      }
    }

    return { deliveredOrders, abortedOrders };
  }

  localResupply(
    siteId: string,
    resource: string,
    amount: number,
  ): { success: boolean; amountSupplied: number; reason?: string } {
    const depot = this.depots.get(siteId);
    if (!depot) {
      return { success: false, amountSupplied: 0, reason: `No depot at site ${siteId}` };
    }
    const available = this.getDepotAvailableStock(siteId, resource);
    if (available <= 0) {
      return { success: false, amountSupplied: 0, reason: `No available ${resource} at depot` };
    }
    const transfer = Math.min(available, amount);
    const consumed = this.recordConsumption(siteId, resource, transfer);
    return { success: true, amountSupplied: consumed };
  }

  recordProduction(siteId: string, resource: string, amount: number): number {
    const depot = this.depots.get(siteId);
    if (!depot || amount <= 0) return 0;
    const free = this.getDepotFreeCapacity(siteId);
    const added = Math.min(free, amount);
    depot.inventory[resource] = (depot.inventory[resource] ?? 0) + added;
    this.cumulativeProduced[resource] = (this.cumulativeProduced[resource] ?? 0) + added;
    return added;
  }

  recordConsumption(siteId: string, resource: string, amount: number): number {
    const depot = this.depots.get(siteId);
    if (!depot || amount <= 0) return 0;
    const current = depot.inventory[resource] ?? 0;
    const removed = Math.min(current, amount);
    depot.inventory[resource] = current - removed;
    this.cumulativeConsumed[resource] = (this.cumulativeConsumed[resource] ?? 0) + removed;
    return removed;
  }

  verifyInventoryConservation(
    initialStocks: Record<string, number>,
  ): InventoryConservationReport {
    const currentTotal: Record<string, number> = {};

    // Sum all depot inventories
    for (const depot of this.depots.values()) {
      for (const [res, count] of Object.entries(depot.inventory)) {
        currentTotal[res] = (currentTotal[res] ?? 0) + count;
      }
    }

    // Sum all courier cargo in custody
    for (const courier of this.couriers.values()) {
      for (const [res, count] of Object.entries(courier.currentCargo)) {
        currentTotal[res] = (currentTotal[res] ?? 0) + count;
      }
    }

    let conserved = true;
    const discrepancies: Record<string, { expected: number; actual: number; delta: number }> = {};

    const allResources = new Set([
      ...Object.keys(initialStocks),
      ...Object.keys(currentTotal),
      ...Object.keys(this.cumulativeProduced),
      ...Object.keys(this.cumulativeConsumed),
    ]);

    for (const res of allResources) {
      const initial = initialStocks[res] ?? 0;
      const produced = this.cumulativeProduced[res] ?? 0;
      const consumed = this.cumulativeConsumed[res] ?? 0;
      const expected = initial + produced - consumed;
      const actual = currentTotal[res] ?? 0;

      if (Math.abs(expected - actual) > 1e-4) {
        conserved = false;
        discrepancies[res] = { expected, actual, delta: actual - expected };
      }
    }

    return { conserved, discrepancies };
  }
}
