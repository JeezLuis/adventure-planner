<script lang="ts">
    import type { GPXFile } from 'gpx';

    // A non-interactive route thumbnail: the track's points projected into an SVG
    // polyline, centered in the box. It reads as a static image (no basemap, no
    // interaction), which is enough to recognize a stage at a glance.
    let { file }: { file: GPXFile } = $props();

    const WIDTH = 260;
    const HEIGHT = 150;
    const PAD = 12;

    let points = $derived.by(() => {
        const coords: { lat: number; lon: number }[] = [];
        for (const track of file.trk) {
            for (const segment of track.trkseg) {
                for (const point of segment.trkpt) {
                    const { lat, lon } = point.attributes ?? {};
                    if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push({ lat, lon });
                }
            }
        }
        return coords;
    });

    let path = $derived.by(() => {
        if (points.length < 2) return null;
        const lats = points.map((p) => p.lat);
        const lons = points.map((p) => p.lon);
        // Aspect-correct longitude so the shape is not stretched at higher latitudes.
        const meanLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const cos = Math.cos((meanLat * Math.PI) / 180) || 1;
        const xs = lons.map((lon) => lon * cos);
        const ys = lats.map((lat) => -lat);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const spanX = maxX - minX || 1e-6;
        const spanY = maxY - minY || 1e-6;
        const scale = Math.min((WIDTH - 2 * PAD) / spanX, (HEIGHT - 2 * PAD) / spanY);
        const offX = PAD + (WIDTH - 2 * PAD - spanX * scale) / 2;
        const offY = PAD + (HEIGHT - 2 * PAD - spanY * scale) / 2;
        return points
            .map((_, i) => {
                const x = offX + (xs[i] - minX) * scale;
                const y = offY + (ys[i] - minY) * scale;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
    });
</script>

<div class="shrink-0 overflow-hidden rounded-md border bg-muted/40 text-primary">
    {#if path}
        <svg
            viewBox="0 0 {WIDTH} {HEIGHT}"
            class="block h-auto w-full"
            role="img"
            aria-label="Route preview"
        >
            <polyline
                points={path}
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linejoin="round"
                stroke-linecap="round"
            />
        </svg>
    {:else}
        <div
            class="flex items-center justify-center text-xs text-muted-foreground"
            style="width: {WIDTH}px; height: {HEIGHT}px; max-width: 100%"
        >
            —
        </div>
    {/if}
</div>
