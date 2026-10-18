import type { APIRoute } from 'astro';
import { importSeed } from '../../../lib/content';

/** Copia a R2 el contenido inicial incluido en el proyecto (no sobrescribe nada). */
export const POST: APIRoute = async ({ request }) => {
	const written = await importSeed();
	return Response.redirect(new URL(`/admin?ok=${encodeURIComponent(`${written} documentos importados`)}`, request.url), 303);
};
