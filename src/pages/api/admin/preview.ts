import type { APIRoute } from 'astro';
import { renderMarkdown } from '../../../lib/content';

/** Vista previa del Markdown en el editor. */
export const POST: APIRoute = async ({ request }) => {
	const md = await request.text();
	return new Response(renderMarkdown(md.slice(0, 50_000)), {
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
};
