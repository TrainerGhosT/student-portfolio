import type { APIRoute } from 'astro';
import { bucket } from '../../../lib/content';

/** Marca como leído o elimina un mensaje guardado en R2. */
export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData();
	const key = String(form.get('key') ?? '');
	const action = String(form.get('_action') ?? '');
	if (!/^messages\/[\w:.-]+\.json$/.test(key)) return new Response('Clave inválida', { status: 400 });

	if (action === 'delete') {
		await bucket().delete(key);
	} else if (action === 'toggle-read') {
		const obj = await bucket().get(key);
		if (obj) {
			const msg = JSON.parse(await obj.text());
			msg.read = !msg.read;
			await bucket().put(key, JSON.stringify(msg, null, 2), { httpMetadata: { contentType: 'application/json' } });
		}
	}
	return Response.redirect(new URL('/admin/mensajes', request.url), 303);
};
