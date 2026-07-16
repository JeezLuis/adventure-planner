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
import { symbolCatalog } from './symbol-catalog';

// The data half (values, colors, getSymbolKey) lives in ./symbol-catalog.ts so
// logic modules and tests can use it without importing Svelte components; this
// module adds the Lucide icons for the UI and re-exports the catalog API.
export { symbolCategoryColors, DEFAULT_WAYPOINT_COLOR, getSymbolKey } from './symbol-catalog';

export type Symbol = {
    value: string;
    icon?: Component<IconProps>;
    iconSvg?: string;
    color: string;
};

/** The Lucide glyphs of each symbol; keys without one render a plain pin. */
const symbolIcons: { [key: string]: { icon?: Component<IconProps>; iconSvg?: string } } = {
    alert: { icon: TriangleAlert, iconSvg: TriangleAlertSvg },
    anchor: { icon: Anchor, iconSvg: AnchorSvg },
    bank: { icon: Landmark, iconSvg: LandmarkSvg },
    beach: { icon: Shell, iconSvg: ShellSvg },
    bike_trail: { icon: Bike, iconSvg: BikeSvg },
    binoculars: { icon: Binoculars, iconSvg: BinocularsSvg },
    building: { icon: Building, iconSvg: BuildingSvg },
    campground: { icon: Tent, iconSvg: TentSvg },
    car: { icon: Car, iconSvg: CarSvg },
    car_repair: { icon: Wrench, iconSvg: WrenchSvg },
    convenience_store: { icon: ShoppingBasket, iconSvg: ShoppingBasketSvg },
    crossing: { icon: X, iconSvg: XSvg },
    department_store: { icon: ShoppingBasket, iconSvg: ShoppingBasketSvg },
    drinking_water: { icon: Droplet, iconSvg: DropletSvg },
    exit: { icon: DoorOpen, iconSvg: DoorOpenSvg },
    lodge: { icon: House, iconSvg: HouseSvg },
    lodging: { icon: Bed, iconSvg: BedSvg },
    forest: { icon: Trees, iconSvg: TreesSvg },
    gas_station: { icon: Fuel, iconSvg: FuelSvg },
    ground_transportation: { icon: TrainFront, iconSvg: TrainFrontSvg },
    hotel: { icon: Bed, iconSvg: BedSvg },
    house: { icon: House, iconSvg: HouseSvg },
    information: { icon: Info, iconSvg: InfoSvg },
    park: { icon: TreeDeciduous, iconSvg: TreeDeciduousSvg },
    parking_area: { icon: CircleParking, iconSvg: CircleParkingSvg },
    pharmacy: { icon: Cross, iconSvg: CrossSvg },
    picnic_area: { icon: Utensils, iconSvg: UtensilsSvg },
    restaurant: { icon: Utensils, iconSvg: UtensilsSvg },
    restricted_area: { icon: Construction, iconSvg: ConstructionSvg },
    restroom: { icon: Toilet, iconSvg: ToiletSvg },
    road: { icon: BrickWall, iconSvg: BrickWallSvg },
    scenic_area: { icon: Binoculars, iconSvg: BinocularsSvg },
    shelter: { icon: Tent, iconSvg: TentSvg },
    shopping_center: { icon: ShoppingBasket },
    shower: { icon: ShowerHead, iconSvg: ShowerHeadSvg },
    summit: { icon: Mountain, iconSvg: MountainSvg },
    telephone: { icon: Phone, iconSvg: PhoneSvg },
    water_source: { icon: Droplet, iconSvg: DropletSvg },
};

export const symbols: { [key: string]: Symbol } = Object.fromEntries(
    Object.entries(symbolCatalog).map(([key, info]) => [key, { ...info, ...symbolIcons[key] }])
);
