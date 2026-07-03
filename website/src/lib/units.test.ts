import { describe, expect, it, vi } from 'vitest';

// units.ts imports the i18n rune module only for unit-label strings; stub it so
// the pure converters can be tested in Node without compiling runes.
vi.mock('$lib/i18n.svelte', () => ({ i18n: { _: (key: string, fallback?: string) => fallback ?? key } }));

import {
    kilometersToMiles,
    milesToKilometers,
    metersToFeet,
    kilometersToNauticalMiles,
    nauticalMilesToKilometers,
    celsiusToFahrenheit,
    distancePerHourToSecondsPerDistance,
    secondsToHHMMSS,
    getConvertedDistance,
    getConvertedElevation,
    getConvertedVelocity,
    getConvertedTemperature,
} from '$lib/units';

describe('scalar conversions', () => {
    it('converts distance both ways and round-trips', () => {
        expect(kilometersToMiles(1)).toBeCloseTo(0.621371, 5);
        expect(milesToKilometers(1)).toBeCloseTo(1.60934, 5);
        expect(milesToKilometers(kilometersToMiles(42))).toBeCloseTo(42, 3);
        expect(metersToFeet(1)).toBeCloseTo(3.28084, 5);
        expect(kilometersToNauticalMiles(1)).toBeCloseTo(0.539957, 5);
        expect(nauticalMilesToKilometers(1)).toBeCloseTo(1.852, 5);
    });

    it('converts temperature', () => {
        expect(celsiusToFahrenheit(0)).toBe(32);
        expect(celsiusToFahrenheit(100)).toBe(212);
        expect(celsiusToFahrenheit(-40)).toBe(-40);
    });
});

describe('distancePerHourToSecondsPerDistance (pace)', () => {
    it('guards against division by zero', () => {
        expect(distancePerHourToSecondsPerDistance(0)).toBe(0);
    });
    it('inverts a speed into seconds-per-unit', () => {
        expect(distancePerHourToSecondsPerDistance(60)).toBe(60); // 60 km/h -> 60 s/km
        expect(distancePerHourToSecondsPerDistance(12)).toBe(300); // 12 km/h -> 300 s/km
    });
});

describe('secondsToHHMMSS', () => {
    it('drops a leading zero hour but keeps zero minutes', () => {
        expect(secondsToHHMMSS(61)).toBe('01:01');
        expect(secondsToHHMMSS(59.7)).toBe('00:59'); // rounds within the minute
    });
    it('keeps the hour when present', () => {
        expect(secondsToHHMMSS(3661)).toBe('01:01:01');
    });
    it('clamps a rounded-up 60th second to 59', () => {
        expect(secondsToHHMMSS(3599.7)).toBe('59:59');
    });
});

describe('unit-aware conversions (explicit target units)', () => {
    it('getConvertedDistance per unit system', () => {
        expect(getConvertedDistance(5, 'metric')).toBe(5);
        expect(getConvertedDistance(5, 'imperial')).toBeCloseTo(3.106855, 5);
        expect(getConvertedDistance(5, 'nautical')).toBeCloseTo(2.699785, 5);
    });

    it('getConvertedElevation keeps meters for nautical (documented upstream choice)', () => {
        expect(getConvertedElevation(100, 'metric')).toBe(100);
        expect(getConvertedElevation(100, 'imperial')).toBeCloseTo(328.084, 3);
        expect(getConvertedElevation(100, 'nautical')).toBe(100);
    });

    it('getConvertedVelocity in speed and pace modes', () => {
        expect(getConvertedVelocity(10, 'speed', 'metric')).toBe(10);
        expect(getConvertedVelocity(10, 'speed', 'imperial')).toBeCloseTo(6.21371, 5);
        expect(getConvertedVelocity(10, 'pace', 'metric')).toBeCloseTo(360, 5); // 10 km/h -> 360 s/km
        expect(getConvertedVelocity(0, 'pace', 'metric')).toBe(0); // 0-speed guard
    });

    it('getConvertedTemperature', () => {
        expect(getConvertedTemperature(0, 'celsius')).toBe(0);
        expect(getConvertedTemperature(0, 'fahrenheit')).toBe(32);
        expect(getConvertedTemperature(100, 'fahrenheit')).toBe(212);
    });
});
