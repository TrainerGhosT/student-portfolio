import { env } from 'cloudflare:workers';

export interface ContactMessage {
	id: string;
	receivedAt: string;
	name: string;
	email: string;
	subject: string;
	message: string;
	company?: string;
	phone?: string;
	read?: boolean;
	channel?: 'email' | 'whatsapp' | 'both';
	emailStatus?: 'sent' | 'failed' | 'skipped';
	whatsappStatus?: 'sent' | 'failed' | 'skipped';
}

const escapeHtml = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Envía el mensaje del formulario usando la API HTTP de Resend (sin SDK). */
export async function sendContactEmail(msg: ContactMessage): Promise<'sent' | 'failed' | 'skipped'> {
	if (!env.RESEND_API_KEY) {
		console.warn('RESEND_API_KEY no configurada: el mensaje solo se guardó en R2.');
		return 'skipped';
	}

	const to = [env.CONTACT_TO, env.CONTACT_CC]
		.flatMap((v) => (v || '').split(','))
		.map((v) => v.trim())
		.filter(Boolean);

	const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#18181b">
  <p style="font-size:12px;color:#71717a;margin:0 0 16px">Nuevo mensaje desde el formulario del portafolio</p>
  <h2 style="font-size:18px;margin:0 0 16px">${escapeHtml(msg.subject)}</h2>
  <table style="font-size:14px;border-collapse:collapse;margin-bottom:16px">
    <tr><td style="padding:2px 12px 2px 0;color:#71717a">Nombre</td><td>${escapeHtml(msg.name)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#71717a">Correo</td><td><a href="mailto:${escapeHtml(msg.email)}">${escapeHtml(msg.email)}</a></td></tr>
    ${msg.company ? `<tr><td style="padding:2px 12px 2px 0;color:#71717a">Empresa</td><td>${escapeHtml(msg.company)}</td></tr>` : ''}
    ${msg.phone ? `<tr><td style="padding:2px 12px 2px 0;color:#71717a">Teléfono</td><td>${escapeHtml(msg.phone)}</td></tr>` : ''}
  </table>
  <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;border-left:3px solid #7611a6;padding-left:12px">${escapeHtml(msg.message)}</div>
  <p style="font-size:12px;color:#71717a;margin-top:24px">Responde directamente a este correo para contestarle a ${escapeHtml(msg.name)}.</p>
</div>`;

	const text = `Nuevo mensaje del portafolio\n\nAsunto: ${msg.subject}\nNombre: ${msg.name}\nCorreo: ${msg.email}\n${
		msg.company ? `Empresa: ${msg.company}\n` : ''
	}${msg.phone ? `Teléfono: ${msg.phone}\n` : ''}\n${msg.message}\n`;

	let res: Response;
	try {
		res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
			'Idempotency-Key': msg.id,
		},
		body: JSON.stringify({
			from: env.CONTACT_FROM,
			to,
			reply_to: `${msg.name} <${msg.email}>`,
			subject: `[Portafolio] ${msg.subject}`,
			html,
			text,
			tags: [{ name: 'source', value: 'portfolio-contact' }],
		}),
		});
	} catch (err) {
		console.error('No se pudo contactar a Resend', err);
		return 'failed';
	}

	if (!res.ok) {
		console.error('Resend respondió', res.status, await res.text());
		return 'failed';
	}
	return 'sent';
}

export async function verifyTurnstile(token: string | null, ip: string | null): Promise<boolean> {
	const secret = env.TURNSTILE_SECRET_KEY;
	if (!secret) return import.meta.env.DEV; // sin secreto configurado solo se permite en desarrollo
	if (!token) return false;

	const body = new FormData();
	body.append('secret', secret);
	body.append('response', token);
	if (ip) body.append('remoteip', ip);

	try {
		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
		const data = (await res.json()) as { success: boolean };
		return data.success === true;
	} catch (err) {
		console.error('No se pudo verificar Turnstile', err);
		return false;
	}
}

/** Aviso interno (p. ej. "CallMeBot ya tiene cupos") a tu propio correo. */
export async function sendNotificationEmail(subject: string, text: string): Promise<'sent' | 'failed' | 'skipped'> {
	if (!env.RESEND_API_KEY) return 'skipped';
	const to = [env.CONTACT_TO, env.CONTACT_CC]
		.flatMap((v) => (v || '').split(','))
		.map((v) => v.trim())
		.filter(Boolean);
	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ from: env.CONTACT_FROM, to, subject: `[Portafolio] ${subject}`, text }),
		});
		return res.ok ? 'sent' : 'failed';
	} catch {
		return 'failed';
	}
}
