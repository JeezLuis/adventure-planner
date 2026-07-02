import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Tests import directly from src/, so no build step is required before
        // running them. They exercise pure TypeScript code and run in Node.
        include: ['tests/**/*.test.ts'],
        environment: 'node',
    },
});
