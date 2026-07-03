import { describe, expect, it } from 'vitest';
import { TrackPoint } from '../src/gpx';
import { ramerDouglasPeucker, crossarcDistance, projectedPoint } from '../src/simplify';

/**
 * Covers the public simplify.ts API (Ramer-Douglas-Peucker plus its planar
 * distance/projection helpers), which drives the point-reduction tool and
 * routing anchor placement but had no direct tests.
 */

const pt = (lat: number, lon: number) => new TrackPoint({ attributes: { lat, lon } });

describe('ramerDouglasPeucker', () => {
    it('returns an empty array for no points', () => {
        expect(ramerDouglasPeucker([])).toEqual([]);
    });

    it('returns the single point unchanged', () => {
        const p = pt(0, 0);
        const result = ramerDouglasPeucker([p]);
        expect(result.map((s) => s.point)).toEqual([p]);
    });

    it('keeps both endpoints for a two-point input', () => {
        const points = [pt(0, 0), pt(0, 1)];
        const result = ramerDouglasPeucker(points);
        expect(result.map((s) => s.point)).toEqual(points);
    });

    it('collapses collinear points to the endpoints', () => {
        // Four points on a straight line (constant lat): every intermediate
        // point is on the segment, so its distance is ~0 < epsilon.
        const points = [pt(0, 0), pt(0, 1), pt(0, 2), pt(0, 3)];
        const result = ramerDouglasPeucker(points, 50);
        expect(result.length).toBe(2);
        expect(result[0].point).toBe(points[0]);
        expect(result[1].point).toBe(points[3]);
    });

    it('retains a spike that exceeds epsilon', () => {
        // The middle point sits ~111 m off the line (0.001 deg lat at the
        // equator), well above a 50 m epsilon, so it must be kept.
        const points = [pt(0, 0), pt(0.001, 0.005), pt(0, 0.01)];
        const result = ramerDouglasPeucker(points, 50);
        expect(result.length).toBe(3);
        expect(result.map((s) => s.point)).toEqual(points);
    });

    it('drops a bump that stays below epsilon', () => {
        // ~11 m off the line, below a 50 m epsilon: collapses to endpoints.
        const points = [pt(0, 0), pt(0.0001, 0.005), pt(0, 0.01)];
        const result = ramerDouglasPeucker(points, 50);
        expect(result.length).toBe(2);
    });
});

describe('crossarcDistance', () => {
    it('measures the perpendicular distance to a horizontal segment at the equator', () => {
        // Segment (0,0)-(0,0.01) is constant-latitude; a point 0.001 deg north
        // of it is 0.001 * 111320 = 111.32 m away.
        const distance = crossarcDistance(pt(0, 0), pt(0, 0.01), pt(0.001, 0.005));
        expect(distance).toBeCloseTo(111.32, 1);
    });

    it('falls back to point distance for a zero-length segment', () => {
        // p1 == p2: distance is the straight-line distance to that point.
        const distance = crossarcDistance(pt(0, 0), pt(0, 0), pt(0, 0.001));
        expect(distance).toBeCloseTo(111.32, 1);
    });

    it('is ~zero for a point already on the segment', () => {
        const distance = crossarcDistance(pt(0, 0), pt(0, 0.01), pt(0, 0.005));
        expect(distance).toBeCloseTo(0, 5);
    });
});

describe('projectedPoint', () => {
    it('projects a point onto the middle of the segment', () => {
        const proj = projectedPoint(pt(0, 0), pt(0, 0.01), pt(0.001, 0.005));
        expect(proj.lon).toBeCloseTo(0.005, 6);
        expect(proj.lat).toBeCloseTo(0, 6);
    });

    it('clamps to the start when the point lies before the segment', () => {
        const proj = projectedPoint(pt(0, 0), pt(0, 0.01), pt(0, -0.02));
        expect(proj.lon).toBeCloseTo(0, 6);
        expect(proj.lat).toBeCloseTo(0, 6);
    });

    it('clamps to the end when the point lies past the segment', () => {
        const proj = projectedPoint(pt(0, 0), pt(0, 0.01), pt(0, 0.05));
        expect(proj.lon).toBeCloseTo(0.01, 6);
        expect(proj.lat).toBeCloseTo(0, 6);
    });
});
