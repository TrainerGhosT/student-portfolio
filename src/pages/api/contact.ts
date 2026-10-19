import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { bucket } from '../../lib/content';
import { sendContactEmail, verifyTurnstile, type ContactMessage } from '../../lib/mail';
import { sendWhatsAppNotification } from '../../lib/whatsapp';

const LIMITS = { name: 100, email: 200, phone: 30, subject: 150, message: 5000, company: 120 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
	});
}

/**
 * Recibe el formulario de contacto y lo entrega desde el servidor:
 *  - channel=email     → correo con Resend
 *  - channel=whatsapp  → mensaje a tu WhatsApp (CallMeBot o WhatsApp Cloud API)
 *  - channel=both      → ambos
 * Siempre guarda una copia en R2 (Admin → Mensajes).
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
	const wantsJson = request.headers.get('accept')?.includes('application/json');
	const reply = (ok: boolean, message: string, status = ok ? 200 : 400) =>
		wantsJson
			? json({ ok, message }, status)
			: Response.redirect(
					new URL(`/contacto?${ok ? 'enviado=1' : 'error=' + encodeURIComponent(message)}#formulario`, request.url),
					303,
				);

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

	const channel = (['email', 'whatsapp', 'both'].includes(get('channel')) ? get('channel') : 'email') as ContactMessage['channel'];
	const data = {
		name: get('name'),
		email: get('email'),
		phone: get('phone'),
		subject: get('subject'),
		message: get('message'),
		company: get('company'),
	};

	if (!data.name || !data.subject || !data.message) return reply(false, 'Completa nombre, asunto y mensaje.');
	if (channel !== 'whatsapp' && !data.email) return reply(false, 'Indica tu correo para poder responderte.');
	if (channel === 'whatsapp' && !data.email && !data.phone) {
		return reply(false, 'Indica un correo o un teléfono para poder responderte.');
	}
	if (data.email && !EMAIL_RE.test(data.email)) return reply(false, 'El correo no parece válido.');
	if (data.phone && !PHONE_RE.test(data.phone)) return reply(false, 'El teléfono no parece válido.');
	for (const [k, max] of Object.entries(LIMITS)) {
		if (data[k as keyof typeof data].length > max) return reply(false, 'Alguno de los campos es demasiado largo.');
	}

	const human = await verifyTurnstile(get('cf-turnstile-response') || null, ip, new URL(request.url));
	if (!human) return reply(false, 'No pudimos verificar que no eres un robot. Recarga la página e intenta de nuevo.');

	const msg: ContactMessage = {
		id: crypto.randomUUID(),
		receivedAt: new Date().toISOString(),
		name: data.name,
		email: data.email,
		phone: data.phone || undefined,
		subject: data.subject,
		message: data.message,
		company: data.company || undefined,
		channel,
		read: false,
	};

	const [emailStatus, whatsappStatus] = await Promise.all([
		channel !== 'whatsapp' ? sendContactEmail(msg) : Promise.resolve(undefined),
		channel !== 'email' ? sendWhatsAppNotification(msg) : Promise.resolve(undefined),
	]);
	msg.emailStatus = emailStatus;
	msg.whatsappStatus = whatsappStatus;

	// Copia de respaldo en R2: se puede leer desde /admin/mensajes.
	let saved = true;
	try {
		await bucket().put(`messages/${msg.receivedAt}-${msg.id}.json`, JSON.stringify(msg, null, 2), {
			httpMetadata: { contentType: 'application/json' },
		});
	} catch (err) {
		saved = false;
		console.error('No se pudo guardar el mensaje en R2', err);
	}

	const delivered = emailStatus === 'sent' || whatsappStatus === 'sent';
	if (!delivered && !saved) {
		return reply(false, 'No se pudo enviar el mensaje en este momento. Intenta de nuevo más tarde.', 500);
	}

	const via =
		channel === 'both' ? 'por correo y WhatsApp' : channel === 'whatsapp' ? 'por WhatsApp' : 'por correo';
	return reply(true, delivered ? `¡Gracias! Tu mensaje fue enviado ${via}. Te responderé pronto.` : 'Mensaje recibido. Te responderé pronto.');
};
