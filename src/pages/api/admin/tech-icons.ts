import type { APIRoute } from 'astro';
import {
	fetchLucideSvg,
	fetchSvglSvg,
	getTechEntry,
	lucidePreviewUrl,
	removeTechEntry,
	resetTechEntry,
	saveTechEntry,
	searchLucide,
	searchSvgl,
} from '../../../lib/tech';

/** Búsqueda de íconos para el selector del admin. */
export const GET: APIRoute = async ({ url }) => {
	const provider = url.searchParams.get('provider');
	const q = (url.searchParams.get('q') ?? '').slice(0, 60);
	try {
		if (provider === 'svgl') {
			if (!q.trim()) return Response.json({ results: [] });
			return Response.json({ results: await searchSvgl(q) });
		}
		if (provider === 'lucide') {
			const names = await searchLucide(q);
			return Response.json({ results: names.map((name) => ({ name, preview: lucidePreviewUrl(name) })) });
		}
		return Response.json({ error: 'Proveedor no válido.' }, { status: 400 });
	} catch (err) {
		return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
	}
};

const back = (request: Request, params: Record<string, string>) =>
	Response.redirect(new URL(`/admin/tecnologias?${new URLSearchParams(params)}`, request.url), 303);

/** Asignar ícono, quitarlo, restablecer o eliminar una tecnología del catálogo. */
export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData();
	const get = (k: string) => String(form.get(k) ?? '').trim();
	const name = get('name').slice(0, 60);
	const action = get('_action');
	if (!name) return back(request, { error: 'Falta el nombre de la tecnología.' });

	try {
		switch (action) {
			case 'svgl': {
				const light = await fetchSvglSvg(get('light'));
				const dark = get('dark') ? await fetchSvglSvg(get('dark')) : undefined;
				await saveTechEntry({ name, source: 'svgl', ref: get('ref') || undefined, light, ...(dark ? { dark } : {}) });
				return back(request, { ok: `«${name}» ahora usa el logo de ${get('ref') || 'svgl'}.` });
			}
			case 'lucide': {
				const ref = get('ref');
				await saveTechEntry({ name, source: 'lucide', ref, light: await fetchLucideSvg(ref) });
				return back(request, { ok: `«${name}» ahora usa el ícono «${ref}» de Lucide.` });
			}
			case 'none':
				await saveTechEntry({ name, source: 'none' });
				return back(request, { ok: `«${name}» se mostrará sin ícono.` });
			case 'add': {
				if (await getTechEntry(name)) return back(request, { error: `«${name}» ya está en el catálogo.` });
				await saveTechEntry({ name, source: 'none' });
				return back(request, { ok: `«${name}» agregada. Elige su ícono.`, edit: name });
			}
			case 'reset':
				await resetTechEntry(name);
				return back(request, { ok: `«${name}» volvió a su ícono original.` });
			case 'remove':
				await removeTechEntry(name);
				return back(request, { ok: `«${name}» se quitó del catálogo.` });
			default:
				return back(request, { error: 'Acción no válida.' });
		}
	} catch (err) {
		return back(request, { error: err instanceof Error ? err.message : String(err) });
	}
};
