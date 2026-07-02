import { base } from '$app/paths';
import { languages } from '$lib/languages';
import { getURLForLanguage } from '$lib/utils';
import { APP_NAME, APP_URL } from '$lib/brand';

/**
 * Injects localized document metadata (title, description, OpenGraph tags,
 * alternate-language links, PWA manifest) into every prerendered page.
 */
export async function handle({ event, resolve }) {
    const language = event.params.language ?? 'en';
    const strings = await import(`./locales/${language}.json`);

    const path = event.url.pathname;
    const page = event.route.id?.replace('/[[language]]', '').split('/')[1] ?? 'home';

    let title = strings.metadata[`${page}_title`];
    const description = strings.metadata[`description`];

    const htmlTag = `<html lang="${language}" translate="no">`;

    let headTag = `<head>
    <title>${APP_NAME} — ${title}</title>
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "${APP_NAME}",
        "url": "${APP_URL}"
    }
    </script>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${APP_NAME} — ${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${APP_URL}/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${APP_NAME}" />
    <link rel="alternate" hreflang="x-default" href="${APP_URL}${getURLForLanguage('en', path)}" />
    <link rel="manifest" href="${base}/${language}.manifest.webmanifest" />`;

    if (page !== '404') {
        for (let lang of Object.keys(languages)) {
            headTag += `   <link rel="alternate" hreflang="${lang}" href="${APP_URL}${getURLForLanguage(lang, path)}" />
`;
        }
    }

    const response = await resolve(event, {
        transformPageChunk: ({ html }) =>
            html.replace('<html>', htmlTag).replace('<head>', headTag),
    });

    return response;
}
