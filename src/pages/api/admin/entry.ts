import type { APIRoute } from 'astro';
import { contentSource, deleteDoc, importSeed, keyFor, saveDoc } from '../../../lib/content';
import { COLLECTIONS, formToData, isCollection, isValidSlug, slugify, type ListCollection } from '../../../lib/schema';

const back = (request: Request, path: string, params: Record<string, string>) =>
	Response.redirect(new URL(`${path}?${new URLSearchParams(params)}`, request.url), 303);

/** Guarda o elimina un documento. Recibe un <form method="post"> del editor. */
export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData();
	const collection = String(form.get('_collection') ?? '');
	const action = String(form.get('_action') ?? 'save');
	const originalSlug = String(form.get('_slug') ?? '');

	if (!isCollection(collection)) return new Response('Colección inválida', { status: 400 });
	const def = COLLECTIONS[collection];
	const listPath = def.kind === 'single' ? '/admin' : `/admin/${collection}`;

	// Si el sitio todavía muestra el contenido semilla, primero lo copiamos a R2
	// para que guardar un documento no "borre" visualmente el resto.
	if ((await contentSource()) === 'seed') await importSeed();

	if (action === 'delete') {
		if (def.kind !== 'list' || !isValidSlug(originalSlug)) return new Response('Slug inválido', { status: 400 });
		await deleteDoc(keyFor(collection as ListCollection, originalSlug));
		return back(request, listPath, { ok: 'Eliminado' });
	}

	const { data, errors } = formToData(def, form);
	const body = String(form.get('body') ?? '').replace(/\r\n/g, '\n');
	const editorPath = def.kind === 'single' ? `/admin/${collection}` : `/admin/${collection}/${originalSlug || 'nuevo'}`;
	if (errors.length) return back(request, editorPath, { error: errors.join(' ') });

	if (def.kind === 'single') {
		await saveDoc(keyFor(collection as 'profile' | 'skills'), data, body);
		return back(request, editorPath, { ok: 'Guardado' });
	}

	const titleValue = String(data[def.titleField ?? 'title'] ?? '');
	const slug = slugify(String(form.get('slug') ?? '') || originalSlug || titleValue);
	if (!isValidSlug(slug)) return back(request, editorPath, { error: 'El identificador (slug) no es válido.' });

	await saveDoc(keyFor(collection as ListCollection, slug), data, body);
	if (originalSlug && originalSlug !== slug) await deleteDoc(keyFor(collection as ListCollection, originalSlug));

	return back(request, `/admin/${collection}/${slug}`, { ok: 'Guardado' });
};
