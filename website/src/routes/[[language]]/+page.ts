/**
 * The site root has no landing page - visitors go straight to the app.
 * With the static adapter, the redirect is prerendered as a meta-refresh
 * page for every shipped language.
 */
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { languages } from '$lib/languages';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => {
    return Object.keys(languages).map((lang) => ({ language: lang == 'en' ? '' : lang }));
};

export const load: PageLoad = ({ params }) => {
    redirect(308, params.language ? `${base}/${params.language}/app` : `${base}/app`);
};
