import { writable, type Writable } from 'svelte/store';

export enum Tool {
    ROUTING,
    WAYPOINT,
    SCISSORS,
    JOIN,
    TIME,
    MERGE,
    EXTRACT,
    ELEVATION,
    REDUCE,
    CLEAN,
}

/**
 * Tools hidden behind the "advanced tools" toggle of the toolbar. The
 * remaining tools (routing, waypoint, scissors) cover the common editing
 * flow and are always visible.
 */
export const ADVANCED_TOOLS: readonly Tool[] = [
    Tool.TIME,
    Tool.MERGE,
    Tool.EXTRACT,
    Tool.ELEVATION,
    Tool.REDUCE,
    Tool.CLEAN,
];

export const currentTool: Writable<Tool | null> = writable(null);
