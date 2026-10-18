import type { APIRoute } from 'astro';
import { bucket, CV_FALLBACK, CV_KEY } from '../lib/content';

/**
 * /cv.pdf            → se abre en el navegador
 * /cv.pdf?descargar  → se descarga
 * Usa el CV subido a R2 desde el admin; si no hay, el PDF incluido en /public/files.
 */
export const GET: APIRoute = async ({ url, request }) => {
	const download = url.searchParams.has('descargar');
	const obj = await bucket().get(CV_KEY).catch(() => null);

	if (!obj) {
		return Response.redirect(new URL(CV_FALLBACK, request.url), 302);
	}

	return new Response(obj.body, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="Dylan_Montoya_CV.pdf"`,
			'Cache-Control': 'public, max-age=300',
			ETag: obj.httpEtag,
		},
	});
};
