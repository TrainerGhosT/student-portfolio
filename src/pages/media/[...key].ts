import type { APIRoute } from 'astro';
import { bucket } from '../../lib/content';

/** Sirve las imágenes subidas desde el admin (R2: media/…). */
export const GET: APIRoute = async ({ params, request }) => {
	const key = `media/${params.key ?? ''}`;
	if (key.includes('..')) return new Response('Not found', { status: 404 });

	const obj = await bucket().get(key, { onlyIf: request.headers });
	if (!obj) return new Response('Not found', { status: 404 });

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set('ETag', obj.httpEtag);
	headers.set('Cache-Control', 'public, max-age=31536000, immutable'); // las claves llevan un id único
	if (!('body' in obj)) return new Response(null, { status: 304, headers });
	return new Response(obj.body, { headers });
};
