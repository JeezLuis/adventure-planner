import {
    Landmark,
    Shell,
    Bike,
    Building,
    Tent,
    Car,
    Wrench,
    ShoppingBasket,
    Droplet,
    DoorOpen,
    Trees,
    Fuel,
    House,
    Info,
    TreeDeciduous,
    CircleParking,
    Cross,
    Utensils,
    Construction,
    BrickWall,
    ShowerHead,
    Mountain,
    Phone,
    TrainFront,
    Bed,
    Binoculars,
    TriangleAlert,
    Anchor,
    Toilet,
    X,
    type IconProps,
} from '@lucide/svelte';
import {
    Landmark as LandmarkSvg,
    Shell as ShellSvg,
    Bike as BikeSvg,
    Building as BuildingSvg,
    Tent as TentSvg,
    Car as CarSvg,
    Wrench as WrenchSvg,
    ShoppingBasket as ShoppingBasketSvg,
    Droplet as DropletSvg,
    DoorOpen as DoorOpenSvg,
    Trees as TreesSvg,
    Fuel as FuelSvg,
    House as HouseSvg,
    Info as InfoSvg,
    TreeDeciduous as TreeDeciduousSvg,
    CircleParking as CircleParkingSvg,
    Cross as CrossSvg,
    Utensils as UtensilsSvg,
    Construction as ConstructionSvg,
    BrickWall as BrickWallSvg,
    ShowerHead as ShowerHeadSvg,
    Mountain as MountainSvg,
    Phone as PhoneSvg,
    TrainFront as TrainFrontSvg,
    Bed as BedSvg,
    Binoculars as BinocularsSvg,
    TriangleAlert as TriangleAlertSvg,
    Anchor as AnchorSvg,
    Toilet as ToiletSvg,
    X as XSvg,
} from 'lucide-static';
import type { Component } from 'svelte';

export type Symbol = {
    value: string;
    icon?: Component<IconProps>;
    iconSvg?: string;
    color: string;
};

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

export const symbols: { [key: string]: Symbol } = {
    alert: { value: 'Alert', icon: TriangleAlert, iconSvg: TriangleAlertSvg, color: danger },
    anchor: { value: 'Anchor', icon: Anchor, iconSvg: AnchorSvg, color: water },
    bank: { value: 'Bank', icon: Landmark, iconSvg: LandmarkSvg, color: services },
    beach: { value: 'Beach', icon: Shell, iconSvg: ShellSvg, color: nature },
    bike_trail: { value: 'Bike Trail', icon: Bike, iconSvg: BikeSvg, color: nature },
    binoculars: { value: 'Binoculars', icon: Binoculars, iconSvg: BinocularsSvg, color: nature },
    bridge: { value: 'Bridge', color: transport },
    building: { value: 'Building', icon: Building, iconSvg: BuildingSvg, color: transport },
    campground: { value: 'Campground', icon: Tent, iconSvg: TentSvg, color: sleep },
    car: { value: 'Car', icon: Car, iconSvg: CarSvg, color: transport },
    car_repair: { value: 'Car Repair', icon: Wrench, iconSvg: WrenchSvg, color: services },
    convenience_store: {
        value: 'Convenience Store',
        icon: ShoppingBasket,
        iconSvg: ShoppingBasketSvg,
        color: services,
    },
    crossing: {
        value: 'Crossing',
        icon: X,
        iconSvg: XSvg,
        color: danger,
    },
    department_store: {
        value: 'Department Store',
        icon: ShoppingBasket,
        iconSvg: ShoppingBasketSvg,
        color: services,
    },
    drinking_water: { value: 'Drinking Water', icon: Droplet, iconSvg: DropletSvg, color: water },
    exit: { value: 'Exit', icon: DoorOpen, iconSvg: DoorOpenSvg, color: transport },
    lodge: { value: 'Lodge', icon: House, iconSvg: HouseSvg, color: sleep },
    lodging: { value: 'Lodging', icon: Bed, iconSvg: BedSvg, color: sleep },
    forest: { value: 'Forest', icon: Trees, iconSvg: TreesSvg, color: nature },
    gas_station: { value: 'Gas Station', icon: Fuel, iconSvg: FuelSvg, color: services },
    ground_transportation: {
        value: 'Ground Transportation',
        icon: TrainFront,
        iconSvg: TrainFrontSvg,
        color: transport,
    },
    hotel: { value: 'Hotel', icon: Bed, iconSvg: BedSvg, color: sleep },
    house: { value: 'House', icon: House, iconSvg: HouseSvg, color: sleep },
    information: { value: 'Information', icon: Info, iconSvg: InfoSvg, color: services },
    park: { value: 'Park', icon: TreeDeciduous, iconSvg: TreeDeciduousSvg, color: nature },
    parking_area: {
        value: 'Parking Area',
        icon: CircleParking,
        iconSvg: CircleParkingSvg,
        color: transport,
    },
    pharmacy: { value: 'Pharmacy', icon: Cross, iconSvg: CrossSvg, color: health },
    picnic_area: { value: 'Picnic Area', icon: Utensils, iconSvg: UtensilsSvg, color: food },
    restaurant: { value: 'Restaurant', icon: Utensils, iconSvg: UtensilsSvg, color: food },
    restricted_area: {
        value: 'Restricted Area',
        icon: Construction,
        iconSvg: ConstructionSvg,
        color: danger,
    },
    restroom: { value: 'Restroom', icon: Toilet, iconSvg: ToiletSvg, color: health },
    road: { value: 'Road', icon: BrickWall, iconSvg: BrickWallSvg, color: transport },
    scenic_area: { value: 'Scenic Area', icon: Binoculars, iconSvg: BinocularsSvg, color: nature },
    shelter: { value: 'Shelter', icon: Tent, iconSvg: TentSvg, color: sleep },
    shopping_center: { value: 'Shopping Center', icon: ShoppingBasket, color: services },
    shower: { value: 'Shower', icon: ShowerHead, iconSvg: ShowerHeadSvg, color: health },
    summit: { value: 'Summit', icon: Mountain, iconSvg: MountainSvg, color: nature },
    telephone: { value: 'Telephone', icon: Phone, iconSvg: PhoneSvg, color: services },
    tunnel: { value: 'Tunnel', color: transport },
    water_source: { value: 'Water Source', icon: Droplet, iconSvg: DropletSvg, color: water },
};

export function getSymbolKey(value: string | undefined): string | undefined {
    if (value === undefined) {
        return undefined;
    } else {
        return Object.keys(symbols).find((key) => symbols[key].value === value);
    }
}
