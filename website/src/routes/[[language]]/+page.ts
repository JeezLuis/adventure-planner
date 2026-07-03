/**
 * The site root has no landing page - visitors go straight to the app.
 * With the static adapter, the redirect is prerendered as a meta-refresh
 * page for every shipped language.
 */
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { languages, DEFAULT_LANGUAGE } from '$lib/languages';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => {
    // The default language is served unprefixed; every other language keeps its
    // prefix so its route prerenders (keying off 'en' would 404 the default).
    return Object.keys(languages).map((lang) => ({
        language: lang === DEFAULT_LANGUAGE ? '' : lang,
    }));
};

export const load: PageLoad = ({ params }) => {
    redirect(308, params.language ? `${base}/${params.language}/app` : `${base}/app`);
};
