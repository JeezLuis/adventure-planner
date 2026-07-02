/**
 * Languages the app ships translations for. Keys are locale codes matching
 * the JSON dictionaries in `src/locales/`, values are the native display
 * names shown in the language selector. Adding a language back requires
 * restoring/creating its `src/locales/<code>.json` dictionary.
 */
export const languages: Record<string, string> = {
    en: 'English',
    es: 'Español',
};

/**
 * The language served at unprefixed URLs and used when none is specified.
 * Must be a key of {@link languages}.
 */
export const DEFAULT_LANGUAGE = 'es';
