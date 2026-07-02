import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: [vitePreprocess({ script: true })],
    kit: {
        adapter: adapter({
            pages: 'build',
            assets: 'build',
            precompress: false,
            strict: true,
        }),
        paths: {
            base: process.argv.includes('dev') ? '' : process.env.BASE_PATH,
            relative: false,
        },
        prerender: {
            crawl: true,
        },
    },
};

export default config;
