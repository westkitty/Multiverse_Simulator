import {
  DeterministicRng,
  DeterministicRngState,
  rngStreamInterface,
  roundDet,
} from './contracts';

function hashStreamName(masterSeed: number, name: string): number {
  let h = (masterSeed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 0x85ebca6b) >>> 0;
    h = ((h << 13) | (h >>> 19)) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0 || 1;
}

class Mulberry32Stream implements rngStreamInterface {
  private state: number;

  constructor(initialState: number) {
    this.state = (initialState >>> 0) || 1;
  }

  getState(): number {
    return this.state >>> 0;
  }

  setState(next: number): void {
    this.state = (next >>> 0) || 1;
  }

  nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unsigned = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return unsigned;
  }

  nextRange(min: number, max: number): number {
    if (max <= min) return min;
    return min + this.nextFloat() * (max - min);
  }

  nextInt(minInclusive: number, maxInclusive: number): number {
    const low = Math.ceil(Math.min(minInclusive, maxInclusive));
    const high = Math.floor(Math.max(minInclusive, maxInclusive));
    if (high <= low) return low;
    return low + Math.floor(this.nextFloat() * (high - low + 1));
  }

  nextBoolean(probability = 0.5): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextFloat() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty array in DeterministicRng');
    }
    const index = this.nextInt(0, items.length - 1);
    return items[index];
  }

  gaussian(mean = 0, stdDev = 1): number {
    const u1 = Math.max(1e-7, this.nextFloat());
    const u2 = this.nextFloat();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return roundDet(mean + z0 * stdDev, 6);
  }
}

export class SeededRng implements DeterministicRng {
  private _masterSeed: number;
  private streams: Map<string, Mulberry32Stream> = new Map();

  constructor(seed: number) {
    this._masterSeed = (Math.floor(seed) >>> 0) || 1337;
  }

  get masterSeed(): number {
    return this._masterSeed;
  }

  stream(name: string): rngStreamInterface {
    let existing = this.streams.get(name);
    if (!existing) {
      const initial = hashStreamName(this._masterSeed, name);
      existing = new Mulberry32Stream(initial);
      this.streams.set(name, existing);
    }
    return existing;
  }

  serialize(): DeterministicRngState {
    const sortedNames = Array.from(this.streams.keys()).sort();
    const serializedStreams: Record<string, number> = {};
    for (const key of sortedNames) {
      const s = this.streams.get(key);
      if (s) {
        serializedStreams[key] = s.getState();
      }
    }
    return {
      masterSeed: this._masterSeed,
      streams: serializedStreams,
    };
  }

  restore(state: DeterministicRngState): void {
    this._masterSeed = (state.masterSeed >>> 0) || 1337;
    this.streams.clear();
    const sortedNames = Object.keys(state.streams || {}).sort();
    for (const key of sortedNames) {
      const stream = new Mulberry32Stream(state.streams[key]);
      this.streams.set(key, stream);
    }
  }

  clone(): DeterministicRng {
    const copy = new SeededRng(this._masterSeed);
    copy.restore(this.serialize());
    return copy;
  }
}
