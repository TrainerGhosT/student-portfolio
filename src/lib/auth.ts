import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * El panel /admin está protegido en dos capas:
 *  1. Cloudflare Access (Zero Trust) intercepta /admin* y /api/admin* en el edge
 *     y solo deja pasar a ADMIN_EMAIL (código de un solo uso al correo).
 *  2. Este código valida el JWT que Access agrega en `Cf-Access-Jwt-Assertion`
 *     (firma, emisor, audiencia y correo). Si alguien llegara al Worker sin pasar
 *     por Access (p. ej. por *.workers.dev) recibe un 404.
 *
 * En desarrollo local (`astro dev`) el panel queda abierto para poder trabajar.
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksFor = '';

export async function getAdminEmail(request: Request): Promise<string | null> {
	if (import.meta.env.DEV) return env.ADMIN_EMAIL || 'dev@localhost';

	const team = (env.ACCESS_TEAM_DOMAIN || '').replace(/\/$/, '');
	const aud = env.ACCESS_AUD;
	const token = request.headers.get('cf-access-jwt-assertion');
	if (!team || !aud || !token) return null;

	if (!jwks || jwksFor !== team) {
		jwks = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
		jwksFor = team;
	}

	try {
		const { payload } = await jwtVerify(token, jwks, { issuer: team, audience: aud });
		const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
		const allowed = (env.ADMIN_EMAIL || '')
			.split(',')
			.map((e) => e.trim().toLowerCase())
			.filter(Boolean);
		return email && allowed.includes(email) ? email : null;
	} catch (err) {
		console.warn('JWT de Access inválido', err);
		return null;
	}
}

export function isAdminPath(pathname: string): boolean {
	return pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/');
}
