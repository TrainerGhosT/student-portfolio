import { env } from 'cloudflare:workers';
import type { ContactMessage } from './mail';

/**
 * Envía el mensaje del formulario a TU WhatsApp desde el servidor (el visitante no sale del sitio).
 *
 * Proveedores (variable WHATSAPP_PROVIDER):
 *  - "callmebot" (por defecto): gratis, pensado para notificaciones a tu propio número.
 *      Secretos: WHATSAPP_PHONE (+50688888888) y CALLMEBOT_APIKEY.
 *  - "meta": WhatsApp Cloud API oficial. Requiere app en Meta, número emisor y una plantilla aprobada
 *      con un parámetro en el cuerpo. Secretos: WHATSAPP_PHONE, META_WA_TOKEN, META_WA_PHONE_NUMBER_ID,
 *      META_WA_TEMPLATE (nombre) y opcional META_WA_TEMPLATE_LANG (es por defecto).
 */
export type WhatsAppStatus = 'sent' | 'failed' | 'skipped';

function buildText(msg: ContactMessage): string {
	const lines = [
		'*Nuevo mensaje del portafolio*',
		`*Asunto:* ${msg.subject}`,
		`*De:* ${msg.name}${msg.company ? ` (${msg.company})` : ''}`,
		msg.email ? `*Correo:* ${msg.email}` : '',
		msg.phone ? `*Teléfono:* ${msg.phone}` : '',
		'',
		msg.message,
	].filter((l, i) => l !== '' || i === 5);
	const text = lines.join('\n');
	return text.length > 1500 ? `${text.slice(0, 1490)}…` : text;
}

async function viaCallMeBot(msg: ContactMessage): Promise<WhatsAppStatus> {
	const phone = env.WHATSAPP_PHONE;
	const apikey = env.CALLMEBOT_APIKEY;
	if (!phone || !apikey) return 'skipped';

	const url = new URL('https://api.callmebot.com/whatsapp.php');
	url.searchParams.set('phone', phone);
	url.searchParams.set('text', buildText(msg));
	url.searchParams.set('apikey', apikey);

	const res = await fetch(url);
	const body = await res.text();
	// CallMeBot responde 200 con HTML; los errores traen texto como "APIKey is invalid".
	if (!res.ok || /invalid|error|not allowed/i.test(body)) {
		console.error('CallMeBot respondió', res.status, body.slice(0, 300));
		return 'failed';
	}
	return 'sent';
}

async function viaMeta(msg: ContactMessage): Promise<WhatsAppStatus> {
	const { WHATSAPP_PHONE: to, META_WA_TOKEN: token, META_WA_PHONE_NUMBER_ID: phoneId, META_WA_TEMPLATE: template } = env;
	if (!to || !token || !phoneId || !template) return 'skipped';

	// Los parámetros de plantilla no admiten saltos de línea ni tabulaciones.
	const param = buildText(msg).replace(/\*/g, '').replace(/\s+/g, ' ').slice(0, 900);
	const version = env.META_GRAPH_VERSION || 'v23.0';

	const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			messaging_product: 'whatsapp',
			to: to.replace(/\D/g, ''),
			type: 'template',
			template: {
				name: template,
				language: { code: env.META_WA_TEMPLATE_LANG || 'es' },
				components: [{ type: 'body', parameters: [{ type: 'text', text: param }] }],
			},
		}),
	});
	if (!res.ok) {
		console.error('WhatsApp Cloud API respondió', res.status, (await res.text()).slice(0, 300));
		return 'failed';
	}
	return 'sent';
}

export async function sendWhatsAppNotification(msg: ContactMessage): Promise<WhatsAppStatus> {
	try {
		return env.WHATSAPP_PROVIDER === 'meta' ? await viaMeta(msg) : await viaCallMeBot(msg);
	} catch (err) {
		console.error('No se pudo enviar el WhatsApp', err);
		return 'failed';
	}
}
