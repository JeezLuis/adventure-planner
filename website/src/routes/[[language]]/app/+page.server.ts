import { languages, DEFAULT_LANGUAGE } from '$lib/languages';
import type { EntryGenerator } from './$types';

export const entries: EntryGenerator = () => {
    // The default language is served unprefixed; every other language keeps its
    // prefix so /<lang>/app prerenders (keying off 'en' would 404 the default).
    return Object.keys(languages).map((lang) => ({
        language: lang === DEFAULT_LANGUAGE ? '' : lang,
    }));
};
