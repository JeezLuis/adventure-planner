import fs from 'fs';
import { languages, DEFAULT_LANGUAGE } from '../languages';
import { APP_URL } from '../brand';

// Generate one manifest per language. The default language is served at
// unprefixed URLs (start_url /app); every other language keeps its /<lang>
// prefix. hooks.server.js links each page to `/<lang>.manifest.webmanifest`,
// so every language (including the default) needs its own manifest.
const baseManifest = JSON.parse(fs.readFileSync('static/en.manifest.webmanifest', 'utf8'));
for (const language of Object.keys(languages)) {
    const prefix = language === DEFAULT_LANGUAGE ? '' : `/${language}`;
    const strings = JSON.parse(fs.readFileSync(`src/locales/${language}.json`, 'utf8'));
    const manifest = {
        ...baseManifest,
        description: strings.metadata.description,
        lang: language,
        start_url: `${prefix}/app`,
        scope: `${prefix}/app`,
        id: `${APP_URL}${prefix}/app`,
    };
    fs.writeFileSync(`static/${language}.manifest.webmanifest`, JSON.stringify(manifest, null, 2));
}
