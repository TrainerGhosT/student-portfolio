import { defineMiddleware } from 'astro:middleware';
import { getAdminEmail, isAdminPath } from './lib/auth';

/** Agrega cabeceras incluso a respuestas inmutables (p. ej. Response.redirect). */
function withHeaders(response: Response, headers: Record<string, string>): Response {
	let res = response;
	try {
		for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
	} catch {
		res = new Response(response.body, response);
		for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
	}
	return res;
}

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;

	// www.dmontoya.dev → dmontoya.dev
	if (context.url.hostname.startsWith('www.')) {
		const target = new URL(context.url);
		target.hostname = target.hostname.slice(4);
		return Response.redirect(target, 301);
	}

	if (isAdminPath(pathname)) {
		const email = await getAdminEmail(context.request);
		if (!email) {
			// 404 en lugar de 401/403: para un visitante, el panel simplemente no existe.
			return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
		}
		context.locals.adminEmail = email;
		return withHeaders(await next(), { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
	}

	return withHeaders(await next(), {
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
	});
});
