import type { APIRoute } from 'astro';
import { bucket, CV_KEY } from '../../../lib/content';
import { slugify } from '../../../lib/schema';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']);
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_PDF = 10 * 1024 * 1024;

/**
 * Sube archivos a R2.
 *  - kind=image → media/<id>-<nombre>, responde { url } (lo usa el editor)
 *  - kind=cv    → files/cv.pdf (reemplaza el CV publicado)
 */
export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData();
	const kind = String(form.get('kind') ?? 'image');
	const file = form.get('file');
	const wantsJson = request.headers.get('accept')?.includes('application/json');

	const fail = (message: string) =>
		wantsJson
			? Response.json({ ok: false, message }, { status: 400 })
			: Response.redirect(new URL(`/admin/archivos?error=${encodeURIComponent(message)}`, request.url), 303);

	if (!(file instanceof File) || file.size === 0) return fail('No se recibió ningún archivo.');

	if (kind === 'cv') {
		if (file.type !== 'application/pdf') return fail('El CV debe ser un PDF.');
		if (file.size > MAX_PDF) return fail('El PDF supera 10 MB.');
		await bucket().put(CV_KEY, file.stream(), {
			httpMetadata: { contentType: 'application/pdf' },
			customMetadata: { originalName: file.name, uploadedAt: new Date().toISOString() },
		});
		return Response.redirect(new URL('/admin/archivos?ok=CV%20actualizado', request.url), 303);
	}

	if (!IMAGE_TYPES.has(file.type)) return fail('Formato de imagen no permitido.');
	if (file.size > MAX_IMAGE) return fail('La imagen supera 5 MB.');

	const dot = file.name.lastIndexOf('.');
	const base = slugify(dot > 0 ? file.name.slice(0, dot) : file.name) || 'imagen';
	const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
	const key = `media/${crypto.randomUUID().slice(0, 8)}-${base}.${ext}`;

	await bucket().put(key, file.stream(), { httpMetadata: { contentType: file.type } });
	const url = `/${key}`;

	return wantsJson
		? Response.json({ ok: true, url })
		: Response.redirect(new URL(`/admin/archivos?ok=${encodeURIComponent('Imagen subida: ' + url)}`, request.url), 303);
};
