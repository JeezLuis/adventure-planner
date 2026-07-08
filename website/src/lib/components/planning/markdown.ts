import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Renders a Note block's Markdown to HTML for display. The output is sanitized
 * with an allow-list (the same defensive pattern used for waypoint popups), so
 * user-authored or imported Markdown can never inject active content. Editing
 * still happens on the raw Markdown string; this is display only.
 */
export function renderMarkdown(markdown: string): string {
    const html = marked.parse(markdown ?? '', { async: false, gfm: true }) as string;
    return sanitizeHtml(html, {
        allowedTags: [
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'p',
            'ul',
            'ol',
            'li',
            'strong',
            'em',
            'del',
            'code',
            'pre',
            'blockquote',
            'a',
            'br',
            'hr',
        ],
        allowedAttributes: {
            a: ['href', 'target', 'rel'],
        },
        transformTags: {
            a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
        },
    }).trim();
}
