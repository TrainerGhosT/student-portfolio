import { env } from 'cloudflare:workers';
import { bucket } from './content';

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

/* -------------------------------------------------------------------------- */
/*  Configuración de correo (editable en /admin/correo, guardada en R2)        */
/* -------------------------------------------------------------------------- */

export interface EmailSettings {
	/** Destinatarios de los mensajes del formulario. */
	to: string[];
	/** Copias opcionales. */
	cc: string[];
	/** Nombre visible del remitente. La dirección sale de CONTACT_FROM (dominio verificado en Resend). */
	fromName: string;
	fromAddress: string;
	apiKeyConfigured: boolean;
	lastTest?: { at: string; ok: boolean; to: string; detail: string };
}

const EMAIL_KEY = 'settings/email.json';
const splitList = (v?: string | string[]) =>
	(Array.isArray(v) ? v : (v || '').split(','))
		.map((x) => x.trim())
		.filter(Boolean);

function parseFrom(value: string): { name: string; address: string } {
	const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
	return m ? { name: m[1].replace(/^"|"$/g, ''), address: m[2] } : { name: '', address: value.trim() };
}

async function readStored(): Promise<Partial<EmailSettings>> {
	try {
		const obj = await bucket().get(EMAIL_KEY);
		return obj ? JSON.parse(await obj.text()) : {};
	} catch {
		return {};
	}
}

export async function getEmailSettings(): Promise<EmailSettings> {
	const stored = await readStored();
	const from = parseFrom(env.CONTACT_FROM || '');
	const to = splitList(stored.to);
	return {
		to: to.length ? to : splitList(env.CONTACT_TO),
		cc: stored.cc ? splitList(stored.cc) : splitList(env.CONTACT_CC),
		fromName: stored.fromName || from.name || 'Portafolio',
		fromAddress: from.address,
		apiKeyConfigured: !!env.RESEND_API_KEY,
		lastTest: stored.lastTest,
	};
}

export async function saveEmailSettings(patch: Partial<Pick<EmailSettings, 'to' | 'cc' | 'fromName' | 'lastTest'>>) {
	const next = { ...(await readStored()), ...patch };
	await bucket().put(EMAIL_KEY, JSON.stringify(next, null, 2), { httpMetadata: { contentType: 'application/json' } });
}

/* -------------------------------------------------------------------------- */
/*  Envío con Resend (API HTTP, sin SDK)                                       */
/* -------------------------------------------------------------------------- */

interface SendInput {
	to: string[];
	cc?: string[];
	subject: string;
	text: string;
	html?: string;
	replyTo?: string;
	idempotencyKey?: string;
	tag?: string;
}

export type SendResult = { status: 'sent' | 'failed' | 'skipped'; detail: string };

export async function sendEmail(input: SendInput, settings?: EmailSettings): Promise<SendResult> {
	if (!env.RESEND_API_KEY) return { status: 'skipped', detail: 'Falta RESEND_API_KEY.' };
	const s = settings ?? (await getEmailSettings());
	if (!s.fromAddress) return { status: 'failed', detail: 'Falta CONTACT_FROM en wrangler.jsonc.' };
	if (!input.to.length) return { status: 'failed', detail: 'No hay destinatarios configurados.' };

	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY}`,
				'Content-Type': 'application/json',
				...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
			},
			body: JSON.stringify({
				from: `${s.fromName} <${s.fromAddress}>`,
				to: input.to,
				...(input.cc?.length ? { cc: input.cc } : {}),
				...(input.replyTo ? { reply_to: input.replyTo } : {}),
				subject: input.subject,
				text: input.text,
				...(input.html ? { html: input.html } : {}),
				...(input.tag ? { tags: [{ name: 'source', value: input.tag }] } : {}),
			}),
		});
		const body = await res.text();
		if (!res.ok) {
			let detail = body.slice(0, 300);
			try {
				detail = (JSON.parse(body) as { message?: string }).message ?? detail;
			} catch {}
			console.error('Resend respondió', res.status, detail);
			return { status: 'failed', detail: `Resend ${res.status}: ${detail}` };
		}
		const id = (() => {
			try {
				return (JSON.parse(body) as { id?: string }).id;
			} catch {
				return undefined;
			}
		})();
		return { status: 'sent', detail: id ? `ID de Resend: ${id}` : 'Enviado.' };
	} catch (err) {
		console.error('No se pudo contactar a Resend', err);
		return { status: 'failed', detail: `No se pudo contactar a Resend: ${String(err)}` };
	}
}

/** Correo con el mensaje del formulario de contacto. */
export async function sendContactEmail(msg: ContactMessage): Promise<'sent' | 'failed' | 'skipped'> {
	const s = await getEmailSettings();

	const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#18181b">
  <p style="font-size:12px;color:#71717a;margin:0 0 16px">Nuevo mensaje desde el formulario del portafolio</p>
  <h2 style="font-size:18px;margin:0 0 16px">${escapeHtml(msg.subject)}</h2>
  <table style="font-size:14px;border-collapse:collapse;margin-bottom:16px">
    <tr><td style="padding:2px 12px 2px 0;color:#71717a">Nombre</td><td>${escapeHtml(msg.name)}</td></tr>
    ${msg.email ? `<tr><td style="padding:2px 12px 2px 0;color:#71717a">Correo</td><td><a href="mailto:${escapeHtml(msg.email)}">${escapeHtml(msg.email)}</a></td></tr>` : ''}
    ${msg.company ? `<tr><td style="padding:2px 12px 2px 0;color:#71717a">Empresa</td><td>${escapeHtml(msg.company)}</td></tr>` : ''}
    ${msg.phone ? `<tr><td style="padding:2px 12px 2px 0;color:#71717a">Teléfono</td><td>${escapeHtml(msg.phone)}</td></tr>` : ''}
  </table>
  <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;border-left:3px solid #7611a6;padding-left:12px">${escapeHtml(msg.message)}</div>
  ${msg.email ? `<p style="font-size:12px;color:#71717a;margin-top:24px">Responde directamente a este correo para contestarle a ${escapeHtml(msg.name)}.</p>` : ''}
</div>`;

	const text = `Nuevo mensaje del portafolio\n\nAsunto: ${msg.subject}\nNombre: ${msg.name}\n${msg.email ? `Correo: ${msg.email}\n` : ''}${
		msg.company ? `Empresa: ${msg.company}\n` : ''
	}${msg.phone ? `Teléfono: ${msg.phone}\n` : ''}\n${msg.message}\n`;

	const result = await sendEmail(
		{
			to: s.to,
			cc: s.cc,
			replyTo: msg.email ? `${msg.name} <${msg.email}>` : undefined,
			subject: `[Portafolio] ${msg.subject}`,
			html,
			text,
			idempotencyKey: msg.id,
			tag: 'portfolio-contact',
		},
		s,
	);
	return result.status;
}

/** Aviso interno (p. ej. "CallMeBot ya tiene cupos") a tus destinatarios configurados. */
export async function sendNotificationEmail(subject: string, text: string): Promise<'sent' | 'failed' | 'skipped'> {
	const s = await getEmailSettings();
	return (await sendEmail({ to: s.to, cc: s.cc, subject: `[Portafolio] ${subject}`, text }, s)).status;
}

/* -------------------------------------------------------------------------- */
/*  Turnstile                                                                  */
/* -------------------------------------------------------------------------- */

// Claves de prueba oficiales de Cloudflare: siempre pasan. Se usan solo en localhost,
// porque la clave real de dmontoya.dev rechaza otros dominios (error 110200).
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';

export function isLocalHost(hostname: string): boolean {
	return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname) || hostname.endsWith('.localhost');
}

export function turnstileSiteKey(url: URL): string | undefined {
	return isLocalHost(url.hostname) ? TURNSTILE_TEST_SITE_KEY : env.TURNSTILE_SITE_KEY || undefined;
}

export async function verifyTurnstile(token: string | null, ip: string | null, url: URL): Promise<boolean> {
	const secret = isLocalHost(url.hostname) ? TURNSTILE_TEST_SECRET : env.TURNSTILE_SECRET_KEY;
	if (!secret) return false;
	if (!token) return false;

	const body = new FormData();
	body.append('secret', secret);
	body.append('response', token);
	if (ip) body.append('remoteip', ip);

	try {
		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
		const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
		if (!data.success) console.warn('Turnstile rechazó el token', data['error-codes']);
		return data.success === true;
	} catch (err) {
		console.error('No se pudo verificar Turnstile', err);
		return false;
	}
}
