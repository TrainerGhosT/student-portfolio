import type { APIRoute } from 'astro';

/** Enlaces antiguos (/work/<slug>) → /proyectos/<slug> */
const OLD_SLUGS: Record<string, string> = { 'pagos-moviles': 'pagos-moviles', 'keep-notes': 'keep-notes', sgfe: 'sgfe', 'file-server': 'file-server' };

export const GET: APIRoute = ({ params, redirect }) => {
	const slug = (params.slug ?? '').replace(/\/$/, '');
	return redirect(`/proyectos/${OLD_SLUGS[slug] ?? slug}`, 301);
};
