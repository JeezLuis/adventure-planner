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
