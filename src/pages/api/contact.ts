import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { bucket, getSingle } from '../../lib/content';
import { whatsappUrl } from '../../lib/whatsapp';
import { sendContactEmail, verifyTurnstile, type ContactMessage } from '../../lib/mail';

const LIMITS = { name: 100, email: 200, subject: 150, message: 5000, company: 120 };

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
	});
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
	const wantsJson = request.headers.get('accept')?.includes('application/json');
	const reply = (ok: boolean, message: string, status = ok ? 200 : 400) =>
		wantsJson
			? json({ ok, message }, status)
			: Response.redirect(new URL(`/contacto?${ok ? 'enviado=1' : 'error=' + encodeURIComponent(message)}#formulario`, request.url), 303);

	const ip = request.headers.get('cf-connecting-ip') ?? clientAddress ?? null;

	// Límite por IP (binding de Rate Limiting de Workers).
	if (env.CONTACT_LIMITER && ip) {
		const { success } = await env.CONTACT_LIMITER.limit({ key: ip });
		if (!success) return reply(false, 'Demasiados envíos seguidos. Intenta de nuevo en un minuto.', 429);
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return reply(false, 'Solicitud inválida.');
	}

	const get = (k: string) => String(form.get(k) ?? '').trim();

	// Honeypot: los bots suelen llenar todos los campos.
	if (get('website')) return reply(true, 'Mensaje enviado.');

	const channel = ['email', 'whatsapp', 'both'].includes(get('channel')) ? get('channel') : 'email';
	const data = {
		name: get('name'),
		email: get('email'),
		subject: get('subject'),
		message: get('message'),
		company: get('company'),
	};

	// Envío por WhatsApp (respaldo sin JavaScript; con JS el navegador abre WhatsApp directamente).
	const profile = (await getSingle('profile'))?.data;
	const waLink = channel !== 'email' && profile?.whatsapp ? whatsappUrl(profile.whatsapp, data) : null;
	if (channel === 'whatsapp') {
		if (!data.name || !data.message) return reply(false, 'Completa tu nombre y el mensaje.');
		if (!waLink) return reply(false, 'WhatsApp no está disponible en este momento.');
		return wantsJson ? json({ ok: true, message: 'Abriendo WhatsApp…', whatsapp: waLink }) : Response.redirect(waLink, 303);
	}

	if (!data.name || !data.email || !data.subject || !data.message) {
		return reply(false, 'Completa nombre, correo, asunto y mensaje.');
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return reply(false, 'El correo no parece válido.');
	for (const [k, max] of Object.entries(LIMITS)) {
		if (data[k as keyof typeof data].length > max) return reply(false, 'Alguno de los campos es demasiado largo.');
	}

	const human = await verifyTurnstile(get('cf-turnstile-response') || null, ip);
	if (!human) return reply(false, 'No pudimos verificar que no eres un robot. Recarga la página e intenta de nuevo.');

	const msg: ContactMessage = {
		id: crypto.randomUUID(),
		receivedAt: new Date().toISOString(),
		...data,
		company: data.company || undefined,
		read: false,
		channel: channel === 'both' ? 'both' : 'email',
	};

	msg.emailStatus = await sendContactEmail(msg);

	// Copia de respaldo en R2: se puede leer desde /admin/mensajes.
	try {
		await bucket().put(`messages/${msg.receivedAt}-${msg.id}.json`, JSON.stringify(msg, null, 2), {
			httpMetadata: { contentType: 'application/json' },
		});
	} catch (err) {
		console.error('No se pudo guardar el mensaje en R2', err);
		if (msg.emailStatus !== 'sent') return reply(false, 'No se pudo enviar el mensaje. Escríbeme directamente por correo.', 500);
	}

	// "Ambos" sin JavaScript: después del correo, continuar en WhatsApp.
	if (waLink && !wantsJson) return Response.redirect(waLink, 303);

	if (msg.emailStatus === 'failed') {
		// Quedó guardado en R2, así que no se pierde; avisamos igual de forma amable.
		return reply(true, 'Mensaje recibido. Te responderé lo antes posible.');
	}
	return reply(true, '¡Gracias! Tu mensaje fue enviado. Te responderé lo antes posible.');
};
