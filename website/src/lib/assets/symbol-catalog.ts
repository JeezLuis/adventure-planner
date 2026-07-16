/**
 * The waypoint symbol catalog: pure data (GPX `<sym>` value and category color
 * per symbol key), importable from logic modules and tests without dragging in
 * Svelte icon components. The UI-facing map with the Lucide icons lives in
 * ./symbols.ts and is built on top of this catalog.
 */

/**
 * Map pin fill per semantic family of symbols, so waypoints can be told
 * apart on the map at a glance. Hues are spread over the wheel to stay
 * distinguishable at pin size, and dark enough for the white glyph on top.
 */
export const symbolCategoryColors = {
    danger: '#dc2626',
    water: '#0284c7',
    nature: '#16a34a',
    sleep: '#7c3aed',
    food: '#ea580c',
    health: '#c026d3',
    services: '#0d9488',
    transport: '#64748b',
} as const;

/** Pin fill of waypoints without a (known) symbol: MapLibre's classic blue. */
export const DEFAULT_WAYPOINT_COLOR = '#3fb1ce';

const { danger, water, nature, sleep, food, health, services, transport } = symbolCategoryColors;

/** The data half of a symbol: its GPX `<sym>` value and its pin color. */
export type SymbolInfo = {
    /** The exact `<sym>` string written to / matched from GPX. */
    value: string;
    color: string;
};

export const symbolCatalog: { [key: string]: SymbolInfo } = {
    alert: { value: 'Alert', color: danger },
    anchor: { value: 'Anchor', color: water },
    bank: { value: 'Bank', color: services },
    beach: { value: 'Beach', color: nature },
    bike_trail: { value: 'Bike Trail', color: nature },
    binoculars: { value: 'Binoculars', color: nature },
    bridge: { value: 'Bridge', color: transport },
    building: { value: 'Building', color: transport },
    campground: { value: 'Campground', color: sleep },
    car: { value: 'Car', color: transport },
    car_repair: { value: 'Car Repair', color: services },
    convenience_store: { value: 'Convenience Store', color: services },
    crossing: { value: 'Crossing', color: danger },
    department_store: { value: 'Department Store', color: services },
    drinking_water: { value: 'Drinking Water', color: water },
    exit: { value: 'Exit', color: transport },
    lodge: { value: 'Lodge', color: sleep },
    lodging: { value: 'Lodging', color: sleep },
    forest: { value: 'Forest', color: nature },
    gas_station: { value: 'Gas Station', color: services },
    ground_transportation: { value: 'Ground Transportation', color: transport },
    hotel: { value: 'Hotel', color: sleep },
    house: { value: 'House', color: sleep },
    information: { value: 'Information', color: services },
    park: { value: 'Park', color: nature },
    parking_area: { value: 'Parking Area', color: transport },
    pharmacy: { value: 'Pharmacy', color: health },
    picnic_area: { value: 'Picnic Area', color: food },
    restaurant: { value: 'Restaurant', color: food },
    restricted_area: { value: 'Restricted Area', color: danger },
    restroom: { value: 'Restroom', color: health },
    road: { value: 'Road', color: transport },
    scenic_area: { value: 'Scenic Area', color: nature },
    shelter: { value: 'Shelter', color: sleep },
    shopping_center: { value: 'Shopping Center', color: services },
    shower: { value: 'Shower', color: health },
    summit: { value: 'Summit', color: nature },
    telephone: { value: 'Telephone', color: services },
    tunnel: { value: 'Tunnel', color: transport },
    water_source: { value: 'Water Source', color: water },
};

export function getSymbolKey(value: string | undefined): string | undefined {
    if (value === undefined) {
        return undefined;
    } else {
        return Object.keys(symbolCatalog).find((key) => symbolCatalog[key].value === value);
    }
}
