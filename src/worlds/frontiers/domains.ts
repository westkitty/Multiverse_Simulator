/** Each domain owns its physical update, field names and units. Shared expedition plumbing
 * does not imply a unified physical model. All values are bounded teaching models. */
export interface DomainRegion { readings: Record<string, number>; hazard: number; production: number }
export interface DomainSpec {
  id: string; name: string; subtitle: string; color: string; baselineRegions: number; signature: string;
  archetypes: string[]; actors: string[]; biomes: string[];
  fields: Array<[string, string, string, number]>;
  history: string; question: string;
  step(region: DomainRegion, neighbor: DomainRegion, health: number, forcing: number, tick: number): void;
}
const bound = (n: number, low = 0, high = 100) => Math.round(Math.max(low, Math.min(high, n)) * 1000) / 1000;
export const FRONTIER_DOMAINS: DomainSpec[] = [
  {
    id: 'wild-meridian', name: 'The Wild Meridian', subtitle: 'Planetary wilderness & expedition logistics', color: '#84cc7b', baselineRegions: 16,
    signature: 'The Silent Valley',
    archetypes: ['Research camp','Wetland gauge','Abandoned outpost','Migration crossing','Desert well','Mountain relay','Forest nursery','River ford','Ancient monument','Ranger settlement','Expedition wreck','Valley observatory'],
    actors: ['Foraging herd','Survey expedition','Ranger repair team','Pack caravan','Camp builders','Ecology researchers'],
    biomes: ['forest','desert','wetland','mountain','river','grassland'],
    fields: [['water','Soil water','%',55],['vegetation','Vegetation cover','%',62],['wildlife','Wildlife density','animals/km²',24],['rain','Rainfall','mm/tick',3]],
    history: 'The regional survey network withdrew after drought stranded its supply caravans. Drainage equipment remained active.',
    question: 'Does reduced water availability precede the valley’s loss of vegetation?',
    step(r, n, h, f, t) {
      const x = r.readings; x.rain = bound((3 + Math.sin(t / 15)) / f, 0, 8);
      x.water = bound(x.water + x.rain * .2 + (n.readings.water - x.water) * .03 - .6 * f + h * .002);
      x.vegetation = bound(x.vegetation + (x.water - 35) * .018 - x.wildlife * .012);
      x.wildlife = bound(x.wildlife + (x.vegetation - 40) * .01, 0, 80);
      r.hazard = bound((100 - x.water) * .45 + (100 - x.vegetation) * .15); r.production = x.vegetation / 140;
    },
  },
  {
    id: 'hollow-deep', name: 'The Hollow Deep', subtitle: 'Vertical passages, aquifers & subterranean ecosystems', color: '#b6a1ee', baselineRegions: 16,
    signature: 'The Cathedral Below',
    archetypes: ['Ventilation station','Aquifer gauge','Abandoned mine','Fungal grove','Mineral seam','Rope shaft','Pump chamber','Underground quay','Buried archive','Survey refuge','Collapsed gallery','Cathedral machinery'],
    actors: ['Fungal grazers','Cave surveyors','Ventilation crew','Ore haulers','Tunnel shorers','Geological researchers'], biomes: ['limestone','basalt','aquifer','shaft','fungal cavern','deep gallery'],
    fields: [['water','Flood depth','m',2],['gas','Toxic gas','ppm',25],['stress','Roof stress','MPa',38],['fungi','Fungal biomass','kg/m²',12]],
    history: 'Pumps and ventilation once served a deep extraction works. Aquifer ingress forced evacuation before the machines were decommissioned.',
    question: 'Do powered vents reduce gas while failed pumps raise flood depth?',
    step(r, n, h, f) {
      const x = r.readings; x.water = bound(x.water + .025 * f + (n.readings.water - x.water) * .04 - h * .0008, 0, 12);
      x.gas = bound(x.gas + .25 * f + x.fungi * .003 - h * .009);
      x.stress = bound(x.stress + x.water * .008 - h * .001);
      x.fungi = bound(x.fungi + x.water * .02 - x.gas * .004, 0, 40);
      r.hazard = bound(x.gas * .5 + x.water * 3 + x.stress * .15); r.production = Math.max(0, (100 - x.stress) / 180);
    },
  },
  {
    id: 'timeworn-empire', name: 'The Timeworn Empire', subtitle: 'Stratigraphy, abandonment & archaeological evidence', color: '#e7bb79', baselineRegions: 12,
    signature: 'The City of Three Foundations',
    archetypes: ['Excavation camp','Erosion gauge','Temple ruin','Ancient road','Clay quarry','Fortification','Conservation shelter','Buried cistern','Layered archive','Surviving settlement','Fallen aqueduct','Three-foundation trench'],
    actors: ['Settlement foragers','Archaeological surveyors','Conservators','Artifact couriers','Shelter builders','Stratigraphers'], biomes: ['floodplain','hill fort','urban ruin','terraced field','silt basin','old road'],
    fields: [['burial','Burial depth','m',6],['erosion','Erosion rate','mm/tick',2],['exposure','Exposed strata','%',10],['occupation','Settlement occupation','%',25]],
    history: 'A river-port foundation was reused by a fortified capital, then by a smaller farming settlement. Flood deposits separate all three occupation layers.',
    question: 'Do deposit depth and exposed masonry support three distinct occupation periods?',
    step(r, n, h, f) {
      const x = r.readings; x.erosion = bound(2 * f + n.readings.erosion * .08 - h * .01, .1, 10);
      x.burial = bound(x.burial - x.erosion / 1000, 0, 10);
      x.exposure = bound(x.exposure + x.erosion * .08);
      x.occupation = bound(x.occupation + (h - 50) * .008);
      r.hazard = bound(x.erosion * 5 + (100 - h) * .3); r.production = x.exposure / 250;
    },
  },
  {
    id: 'terraforming-frontier', name: 'The Terraforming Frontier', subtitle: 'Atmospheric engineering & settlement survival', color: '#73dcb9', baselineRegions: 16,
    signature: 'The First Green',
    archetypes: ['Colony camp','Atmospheric sensor','Failed settlement','Greenhouse','Ice extractor','Power relay','Soil laboratory','Water recycler','Mission archive','Pressurized habitat','Broken processor','Green biosphere'],
    actors: ['Greenhouse tenders','Rover surveyors','Processor technicians','Supply crawlers','Habitat builders','Soil researchers'], biomes: ['ice plain','basalt desert','crater','sheltered basin','dust ridge','meltwater channel'],
    fields: [['pressure','Surface pressure','kPa',18],['temperature','Temperature','°C',-25],['soil','Soil viability','%',18],['oxygen','Oxygen fraction','%',2]],
    history: 'An early colony lost its power bus. A surviving greenhouse and atmospheric processor continued modifying a sheltered basin.',
    question: 'Does restored processor capacity change pressure before soil and oxygen improve?',
    step(r, n, h, f) {
      const x = r.readings; x.pressure = bound(x.pressure + h * .002 - .07 * f + (n.readings.pressure - x.pressure) * .02, 0, 120);
      x.temperature = bound(x.temperature + x.pressure * .002 - .03 * f, -60, 40);
      x.soil = bound(x.soil + (x.temperature + 20) * .002 + h * .0005);
      x.oxygen = bound(x.oxygen + x.soil * .0005 - .005 * f, 0, 25);
      r.hazard = bound((80 - x.pressure * .4 - x.oxygen) * .8); r.production = Math.max(.1, x.soil / 100);
    },
  },
  {
    id: 'machine-wilderness', name: 'The Machine Wilderness', subtitle: 'Autonomous objectives & infrastructure dependencies', color: '#f0a57b', baselineRegions: 16,
    signature: 'The Unfinished City',
    archetypes: ['Repair depot','Grid meter','Derelict factory','Robot settlement','Salvage field','Power substation','Fabricator','Transport hub','Data archive','Construction yard','Dormant assembly line','Unfinished civic core'],
    actors: ['Salvage collectors','Mapping robots','Maintenance robots','Freight robots','Construction robots','Diagnostic robots'], biomes: ['factory floor','salvage basin','rail corridor','power district','machine settlement','assembly yard'],
    fields: [['power','Grid power','kW',40],['backlog','Construction backlog','tasks',75],['wear','Equipment wear','%',28],['output','Fabricated parts','units/tick',2]],
    history: 'The operator departure left a civic construction objective active. Power loss and missing material shipments prevent completion.',
    question: 'Is construction constrained by the active objective, material stock or power supply?',
    step(r, n, h, f) {
      const x = r.readings; x.power = bound(x.power + h * .006 + (n.readings.power - x.power) * .04 - .2 * f, 0, 120);
      x.wear = bound(x.wear + .06 * f - h * .0006);
      x.output = bound(x.power * (1 - x.wear / 100) / 20, 0, 10);
      x.backlog = bound(x.backlog + .04 * f - x.output * .03, 0, 200);
      r.hazard = bound(x.wear * .6 + Math.max(0, 30 - x.power)); r.production = x.output / 3;
    },
  },
  {
    id: 'signal-expanse', name: 'The Signal Expanse', subtitle: 'Interstellar survey logistics & anomaly research', color: '#83b9ff', baselineRegions: 12,
    signature: 'The Last Transmission',
    archetypes: ['Survey outpost','Sensor array','Derelict ship','Navigation beacon','Fuel cache','Relay station','Probe workshop','Docking platform','Telemetry archive','Research station','Debris wreck','Transmission complex'],
    actors: ['Fuel skimmers','Survey ships','Probe technicians','Tanker drones','Beacon constructors','Signal analysts'], biomes: ['debris field','quiet sector','radiation belt','dust cloud','relay corridor','deep survey sector'],
    fields: [['signal','Signal strength','dB',35],['noise','Background noise','dB',18],['coverage','Sensor coverage','%',24],['radiation','Radiation flux','mSv/tick',10]],
    history: 'A research mission exhausted its navigation reserves. A powered telemetry buffer on the derelict complex still repeats measurements with changing interference.',
    question: 'Does the changing transmission track relay power, interference or the stored source?',
    step(r, n, h, f, t) {
      const x = r.readings; x.radiation = bound(12 * f + Math.sin(t / 11) * 5, 0, 60);
      x.noise = bound(x.radiation * .7 + n.readings.noise * .15, 0, 70);
      x.coverage = bound(x.coverage + h * .002 - .03 * f);
      x.signal = bound(h * .6 + n.readings.signal * .15 - x.noise * .4);
      r.hazard = bound(x.radiation + (100 - x.coverage) * .3); r.production = Math.max(.1, x.signal / 80);
    },
  },
];
