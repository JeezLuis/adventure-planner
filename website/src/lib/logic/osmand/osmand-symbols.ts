import { symbolCatalog, getSymbolKey, DEFAULT_WAYPOINT_COLOR } from '$lib/assets/symbol-catalog';

/**
 * Mapping from Adventure Planner waypoint symbols to OsmAnd waypoint icons.
 *
 * OsmAnd waypoints carry their appearance in GPX extensions (`osmand:icon`,
 * `osmand:color`, `osmand:background`), and waypoints sharing a `<type>` form a
 * named group whose defaults live in `<osmand:points_groups>`. This module maps
 * our symbol vocabulary (see $lib/assets/symbols.ts, `<sym>` values) onto that
 * model: the OsmAnd icon comes from the table below, the color from our symbol
 * category, and the group from the symbol's display value.
 *
 * Every icon name below is verified against OsmAnd's in-app picker catalog:
 * https://github.com/osmandapp/OsmAnd-resources/blob/master/poi/poi_categories.json
 * An unknown name would not break the import: OsmAnd falls back to its default
 * star icon while keeping our color and background.
 */

/** OsmAnd's fallback icon, used for waypoints without a (known) symbol. */
export const OSMAND_DEFAULT_ICON = 'special_star';

/** Background shape used for all exported waypoints. */
export const OSMAND_BACKGROUND = 'circle';

/** Group name for waypoints whose `<sym>` is missing or unknown. */
export const OSMAND_DEFAULT_GROUP = 'Waypoints';

/** OsmAnd icon name per symbol key of $lib/assets/symbols.ts. */
export const osmandIcons: Record<string, string> = {
    alert: 'special_symbol_exclamation_mark',
    anchor: 'leisure_marina',
    bank: 'amenity_atm',
    beach: 'beach',
    bike_trail: 'special_bicycle',
    binoculars: 'tourism_viewpoint',
    bridge: 'bridge_structure_arch',
    building: 'special_building',
    campground: 'tourism_camp_site',
    car: 'special_pickup_truck',
    car_repair: 'shop_car_repair',
    convenience_store: 'shop_food',
    crossing: 'special_symbol_remove',
    department_store: 'shop_department_store',
    drinking_water: 'amenity_drinking_water',
    exit: 'special_arrow_right',
    lodge: 'special_house',
    lodging: 'tourism_hotel',
    forest: 'wood',
    gas_station: 'fuel',
    ground_transportation: 'public_transport_stop_position',
    hotel: 'tourism_hotel',
    house: 'special_house',
    information: 'tourism_information',
    park: 'park',
    parking_area: 'amenity_parking',
    pharmacy: 'health_amenity_type_first_aid_kit',
    picnic_area: 'tourism_picnic_site',
    restaurant: 'restaurants',
    restricted_area: 'special_symbol_minus',
    restroom: 'amenity_toilets',
    road: 'special_offroad',
    scenic_area: 'tourism_viewpoint',
    shelter: 'rest_area',
    shopping_center: 'shop_mall',
    shower: 'swimming_pool',
    summit: 'mountain',
    telephone: 'special_symbol_at_sign',
    tunnel: 'tunnel',
    water_source: 'natural_spring',
};

/** The complete OsmAnd appearance of one exported waypoint. */
export type OsmandWaypointStyle = {
    /** OsmAnd icon name. */
    icon: string;
    /** Icon color, #RRGGBB (our symbol-category color). */
    color: string;
    /** Background shape. */
    background: string;
    /** Points-group name (the waypoint's `<type>`). */
    group: string;
};

/**
 * Resolves the OsmAnd appearance for a waypoint from its GPX `<sym>` value.
 * Unknown symbols keep their original `<sym>` text as the group name (so the
 * grouping stays meaningful) with the default icon and color.
 */
export function osmandWaypointStyle(sym: string | undefined): OsmandWaypointStyle {
    const key = getSymbolKey(sym);
    if (key === undefined) {
        return {
            icon: OSMAND_DEFAULT_ICON,
            color: DEFAULT_WAYPOINT_COLOR,
            background: OSMAND_BACKGROUND,
            group: sym?.trim() || OSMAND_DEFAULT_GROUP,
        };
    }
    return {
        icon: osmandIcons[key] ?? OSMAND_DEFAULT_ICON,
        color: symbolCatalog[key].color,
        background: OSMAND_BACKGROUND,
        group: symbolCatalog[key].value,
    };
}
