import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { GPXFile, type WaypointType } from 'gpx';
import { symbolCatalog } from '$lib/assets/symbol-catalog';
import { osmandIcons, osmandWaypointStyle } from './osmand-symbols';
import {
    DEFAULT_OSMAND_EXPORT_OPTIONS,
    colorWithOpacity,
    sanitizeOsmandExportOptions,
} from './osmand-options';
import {
    MILESTONE_GROUP,
    buildOsmandPackage,
    buildOsmandPackageParts,
    planDocToHtml,
    type OsmandTrackInput,
} from './osmand-export';

/** A straight track along the equator; 0.01 degrees of longitude ≈ 1.112 km. */
function equatorLine(fromStep: number, toStep: number): [number, number][] {
    const points: [number, number][] = [];
    for (let step = fromStep; step <= toStep; step++) {
        points.push([0, step * 0.01]);
    }
    return points;
}

function makeFile(
    name: string,
    points: [number, number][],
    wpt: Partial<WaypointType>[] = []
): GPXFile {
    return new GPXFile({
        attributes: {},
        metadata: { name },
        wpt: wpt.map((waypoint) => ({
            attributes: { lat: 0, lon: 0 },
            ...waypoint,
        })) as WaypointType[],
        trk: [
            {
                trkseg: [
                    {
                        trkpt: points.map(([lat, lon]) => ({ attributes: { lat, lon } })),
                    },
                ],
            },
        ],
        rte: [],
    });
}

describe('osmand symbol mapping', () => {
    it('maps every catalog symbol to an OsmAnd icon', () => {
        for (const key of Object.keys(symbolCatalog)) {
            expect(osmandIcons[key], `missing OsmAnd icon for symbol '${key}'`).toBeDefined();
        }
    });

    it('resolves known symbols to their category color and group', () => {
        const style = osmandWaypointStyle('Drinking Water');
        expect(style).toEqual({
            icon: 'amenity_drinking_water',
            color: '#0284c7',
            background: 'circle',
            group: 'Drinking Water',
        });
    });

    it('falls back to the default icon for unknown symbols, keeping the group name', () => {
        const style = osmandWaypointStyle('My Custom Spot');
        expect(style.icon).toBe('special_star');
        expect(style.group).toBe('My Custom Spot');
    });
});

describe('colorWithOpacity', () => {
    it('encodes the opacity as an alpha channel', () => {
        expect(colorWithOpacity('#00ff00', 0.5)).toBe('#8000ff00');
        expect(colorWithOpacity('#ABCDEF', 0.25)).toBe('#40abcdef');
    });

    it('keeps the 6-digit form at full opacity', () => {
        expect(colorWithOpacity('#00FF00', 1)).toBe('#00ff00');
    });
});

describe('sanitizeOsmandExportOptions', () => {
    it('returns defaults for junk input', () => {
        expect(sanitizeOsmandExportOptions(null)).toEqual(DEFAULT_OSMAND_EXPORT_OPTIONS);
        expect(sanitizeOsmandExportOptions('nope')).toEqual(DEFAULT_OSMAND_EXPORT_OPTIONS);
    });

    it('clamps and validates field by field', () => {
        const options = sanitizeOsmandExportOptions({
            mainColor: 'magenta',
            alternativeColor: '#00FF00',
            alternativeOpacity: 3,
            width: 99,
            milestoneIntervalKm: 1,
            activity: 'flying',
        });
        expect(options.mainColor).toBe(DEFAULT_OSMAND_EXPORT_OPTIONS.mainColor);
        expect(options.alternativeColor).toBe('#00ff00');
        expect(options.alternativeOpacity).toBe(1);
        expect(options.width).toBe(24);
        expect(options.milestoneIntervalKm).toBe(5);
        expect(options.activity).toBe(DEFAULT_OSMAND_EXPORT_OPTIONS.activity);
    });
});

describe('planDocToHtml', () => {
    it('renders checklists as ☑/☐ lines with a bold title', () => {
        const html = planDocToHtml('## Packing\n- [ ] Tent\n- [x] Stove (2 L)');
        expect(html).toContain('<p><b>Packing</b></p>');
        expect(html).toContain('☐ Tent');
        expect(html).toContain('☑ Stove (2 L)');
    });

    it('renders tables as pipe-separated lines', () => {
        const html = planDocToHtml('## Fuel\n\n| Day | Km |\n| --- | --- |\n| 1 | 250 |');
        expect(html).toContain('<p><b>Fuel</b></p>');
        expect(html).toContain('Day | Km');
        expect(html).toContain('1 | 250');
    });

    it('renders notes through Markdown and strips unsafe HTML', () => {
        const html = planDocToHtml('Some **bold** plan\n\n<script>alert(1)</script>');
        expect(html).toContain('<strong>bold</strong>');
        expect(html).not.toContain('<script');
    });

    it('returns an empty string for an empty document', () => {
        expect(planDocToHtml(undefined)).toBe('');
        expect(planDocToHtml('  \n ')).toBe('');
    });
});

describe('buildOsmandPackageParts', () => {
    const options = { ...DEFAULT_OSMAND_EXPORT_OPTIONS };

    function fixtureTracks(): OsmandTrackInput[] {
        // Two mains of ~33.4 km each (total ~66.7 km) and one alternative.
        const mainA = makeFile('Day one', equatorLine(0, 30), [
            { attributes: { lat: 0, lon: 0.1 }, name: 'Fountain', sym: 'Drinking Water' },
        ]);
        const alt = makeFile('Scenic detour', equatorLine(0, 5), [
            { attributes: { lat: 0, lon: 0.02 }, name: 'Somewhere', sym: 'Mystery Spot' },
        ]);
        const mainB = makeFile('Day two', equatorLine(30, 60));
        return [
            { file: mainA, stageLabel: '1', alternative: false },
            { file: alt, alternative: true },
            { file: mainB, stageLabel: '2', alternative: false, bufferDays: 1 },
        ];
    }

    it('lays out one styled GPX per track under the adventure folder', () => {
        const parts = buildOsmandPackageParts(
            { name: 'Pyrenees 2026', planDoc: '## Packing\n- [ ] Tent' },
            fixtureTracks(),
            options
        );

        expect(parts.folder).toBe('Pyrenees 2026');
        expect(parts.entries.map((entry) => entry.path)).toEqual([
            'tracks/Pyrenees 2026/01 - [1] Day one.gpx',
            'tracks/Pyrenees 2026/02 - Scenic detour (ALT).gpx',
            'tracks/Pyrenees 2026/03 - [2] Day two.gpx',
        ]);

        const manifest = JSON.parse(parts.itemsJson);
        expect(manifest.version).toBe(1);
        expect(manifest.items).toHaveLength(3);
        expect(manifest.items[0]).toEqual({
            type: 'GPX',
            file: 'tracks/Pyrenees 2026/01 - [1] Day one.gpx',
            color: '#ff00ff',
            width: '20',
            show_arrows: true,
            show_start_finish: true,
        });
        expect(manifest.items[1].color).toBe('#8000ff00');
    });

    it('writes the appearance as osmand extensions inside each GPX', () => {
        const [main, alt] = buildOsmandPackageParts(
            { name: 'Trip' },
            fixtureTracks(),
            options
        ).entries;

        expect(main.xml).toContain('<osmand:color>#ff00ff</osmand:color>');
        expect(main.xml).toContain('<osmand:width>20</osmand:width>');
        expect(main.xml).toContain('<osmand:show_arrows>true</osmand:show_arrows>');
        expect(main.xml).toContain('<osmand:show_start_finish>true</osmand:show_start_finish>');
        expect(main.xml).toContain(
            'xmlns:osmand="https://osmand.net/docs/technical/osmand-file-formats/osmand-gpx"'
        );
        expect(alt.xml).toContain('<osmand:color>#8000ff00</osmand:color>');
    });

    it('styles waypoints with OsmAnd icon, color, background and points group', () => {
        const parts = buildOsmandPackageParts({ name: 'Trip' }, fixtureTracks(), options);
        const main = parts.entries[0].xml;

        expect(main).toContain('<osmand:icon>amenity_drinking_water</osmand:icon>');
        expect(main).toContain('<osmand:color>#0284c7</osmand:color>');
        expect(main).toContain('<osmand:background>circle</osmand:background>');
        expect(main).toContain('<type>Drinking Water</type>');
        expect(main).toContain('<osmand:points_groups>');
        expect(main).toContain(
            'name="Drinking Water" color="#0284c7" icon="amenity_drinking_water" background="circle"'
        );

        // Unknown symbols keep their sym text as the group and get the star icon.
        const alt = parts.entries[1].xml;
        expect(alt).toContain('<osmand:icon>special_star</osmand:icon>');
        expect(alt).toContain('<type>Mystery Spot</type>');
    });

    it('places milestone waypoints along the main route only, with done|left names', () => {
        const parts = buildOsmandPackageParts({ name: 'Trip' }, fixtureTracks(), options);
        const [mainA, alt, mainB] = parts.entries;

        // Total ≈ 66.7 km with a 25 km interval: marks at 25 km (on day one,
        // ~33.4 km long) and at 50 km (on day two).
        expect(mainA.xml).toMatch(/<name>25 km \| \d+ km left<\/name>/);
        expect(mainB.xml).toMatch(/<name>50 km \| \d+ km left<\/name>/);
        expect(mainA.xml).toContain(`<type>${MILESTONE_GROUP}</type>`);
        expect(alt.xml).not.toContain(`<type>${MILESTONE_GROUP}</type>`);
    });

    it('omits milestones when disabled', () => {
        const parts = buildOsmandPackageParts({ name: 'Trip' }, fixtureTracks(), {
            ...options,
            milestones: false,
        });
        for (const entry of parts.entries) {
            expect(entry.xml).not.toContain(`<type>${MILESTONE_GROUP}</type>`);
        }
    });

    it('carries adventure metadata as readable tags and the plan as HTML description', () => {
        const parts = buildOsmandPackageParts(
            { name: 'Pyrenees 2026', planDoc: '## Packing\n- [ ] Tent' },
            fixtureTracks(),
            options
        );
        const [mainA, alt, mainB] = parts.entries;

        expect(mainA.xml).toContain('<adventure>Pyrenees 2026</adventure>');
        expect(mainA.xml).toContain('<stage>1</stage>');
        expect(mainA.xml).toContain('<osmand:activity>adventure_motorcycling</osmand:activity>');
        expect(alt.xml).toContain('<alternative>yes</alternative>');
        expect(alt.xml).not.toContain('<stage>');
        expect(mainB.xml).toContain('<buffer_days>1</buffer_days>');

        // The plan document lands entity-escaped in <metadata><desc>.
        expect(mainA.xml).toContain('&lt;p&gt;&lt;b&gt;Packing&lt;/b&gt;&lt;/p&gt;');
        expect(mainA.xml).toContain('☐ Tent');
    });

    it('omits the activity tag when set to none', () => {
        const parts = buildOsmandPackageParts({ name: 'Trip' }, fixtureTracks(), {
            ...options,
            activity: 'none',
        });
        expect(parts.entries[0].xml).not.toContain('osmand:activity');
    });

    it('sanitizes the folder name and deduplicates file names', () => {
        const tracks: OsmandTrackInput[] = [
            { file: makeFile('Same', equatorLine(0, 2)), alternative: false },
            { file: makeFile('Same', equatorLine(0, 2)), alternative: false },
        ];
        const parts = buildOsmandPackageParts({ name: 'A/B: trip?' }, tracks, options);
        expect(parts.folder).toBe('A-B- trip-');
        expect(parts.entries[0].fileName).toBe('01 - Same.gpx');
        expect(parts.entries[1].fileName).toBe('02 - Same.gpx');
    });

    it('rejects an empty adventure', () => {
        expect(() => buildOsmandPackageParts({ name: 'Empty' }, [], options)).toThrow();
    });
});

describe('buildOsmandPackage', () => {
    it('produces an .osf zip holding items.json and the track files', async () => {
        const tracks: OsmandTrackInput[] = [
            { file: makeFile('Day one', equatorLine(0, 3)), alternative: false },
        ];
        const { fileName, blob } = await buildOsmandPackage(
            { name: 'Trip' },
            tracks,
            DEFAULT_OSMAND_EXPORT_OPTIONS
        );
        expect(fileName).toBe('Trip.osf');

        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        const paths = Object.keys(zip.files)
            .filter((path) => !zip.files[path].dir)
            .sort();
        expect(paths).toEqual(['items.json', 'tracks/Trip/01 - Day one.gpx']);

        const manifest = JSON.parse(await zip.files['items.json'].async('string'));
        expect(manifest.items[0].file).toBe('tracks/Trip/01 - Day one.gpx');
    });
});
