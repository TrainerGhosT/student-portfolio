import { env } from 'cloudflare:workers';
import type { ContactMessage } from './mail';
import { activeProvider, getWhatsAppSettings, saveWhatsAppSettings, type WhatsAppSettings } from './settings';

/**
 * Envía el mensaje del formulario a TU WhatsApp desde el servidor (el visitante no sale del sitio).
 * El proveedor se elige en /admin/whatsapp:
 *  - CallMeBot: gratis, notificaciones a tu propio número (requiere activar una API key).
 *  - WhatsApp Cloud API (Meta): oficial; un número emisor de Meta te escribe a tu WhatsApp personal.
 *  - Automático: usa CallMeBot en cuanto tenga API key; mientras tanto, Meta.
 */
export type WhatsAppStatus = 'sent' | 'failed' | 'skipped';

function buildText(msg: Pick<ContactMessage, 'subject' | 'name' | 'company' | 'email' | 'phone' | 'message'>): string {
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

async function viaCallMeBot(s: WhatsAppSettings, text: string): Promise<WhatsAppStatus> {
	const url = new URL('https://api.callmebot.com/whatsapp.php');
	url.searchParams.set('phone', s.phone!);
	url.searchParams.set('text', text);
	url.searchParams.set('apikey', s.callmebotApiKey!);

	const res = await fetch(url);
	const body = await res.text();
	// CallMeBot responde 200 con HTML; los errores traen texto como "APIKey is invalid".
	if (!res.ok || /invalid|error|not allowed/i.test(body)) {
		console.error('CallMeBot respondió', res.status, body.slice(0, 300));
		return 'failed';
	}
	return 'sent';
}

async function viaMeta(s: WhatsAppSettings, text: string): Promise<WhatsAppStatus> {
	// Los parámetros de plantilla no admiten saltos de línea ni tabulaciones.
	const param = text.replace(/\*/g, '').replace(/\s+/g, ' ').slice(0, 900);
	const version = env.META_GRAPH_VERSION || 'v23.0';

	const res = await fetch(`https://graph.facebook.com/${version}/${s.meta!.phoneNumberId}/messages`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${s.meta!.token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			messaging_product: 'whatsapp',
			to: s.phone!.replace(/\D/g, ''),
			type: 'template',
			template: {
				name: s.meta!.template,
				language: { code: s.meta!.lang || 'es' },
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

export async function sendWhatsAppText(text: string, settings?: WhatsAppSettings): Promise<{ status: WhatsAppStatus; provider: string | null }> {
	const s = settings ?? (await getWhatsAppSettings());
	const provider = activeProvider(s);
	if (!provider) return { status: 'skipped', provider };
	try {
		const status = provider === 'callmebot' ? await viaCallMeBot(s, text) : await viaMeta(s, text);
		return { status, provider };
	} catch (err) {
		console.error('No se pudo enviar el WhatsApp', err);
		return { status: 'failed', provider };
	}
}

export async function sendWhatsAppNotification(msg: ContactMessage): Promise<WhatsAppStatus> {
	return (await sendWhatsAppText(buildText(msg))).status;
}

/* -------------------------------------------------------------------------- */
/*  Disponibilidad de CallMeBot (lo revisa un cron diario y el botón del admin) */
/* -------------------------------------------------------------------------- */

const CALLMEBOT_PAGE = 'https://www.callmebot.com/blog/free-api-whatsapp-messages/';

export async function checkCallMeBotAvailability(): Promise<{ available: boolean; botNumber?: string; error?: string }> {
	try {
		const res = await fetch(CALLMEBOT_PAGE, { headers: { 'User-Agent': 'dmontoya.dev portfolio (availability check)' } });
		const html = await res.text();
		const full = /currently full|check back in a few days/i.test(html);
		const match = html.match(/\+34[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}/);
		const botNumber = match?.[0].replace(/[\s-]/g, ' ').trim();
		return { available: !full && !!botNumber, botNumber: !full ? botNumber : undefined };
	} catch (err) {
		return { available: false, error: String(err) };
	}
}

/**
 * Revisa CallMeBot y, la primera vez que haya cupos, te avisa por correo con el número del bot.
 * La activación final (enviar "I allow callmebot to send me messages" desde tu WhatsApp)
 * la tienes que hacer tú; luego pegas la API key en /admin/whatsapp y el modo «Automático» la usa sola.
 */
export async function runCallMeBotWatch(notify: (subject: string, text: string) => Promise<unknown>): Promise<void> {
	const settings = await getWhatsAppSettings();
	if (settings.callmebotApiKey) return; // ya está activo, nada que vigilar

	const result = await checkCallMeBotAvailability();
	const status: WhatsAppSettings['callmebotStatus'] = {
		checkedAt: new Date().toISOString(),
		available: result.available,
		botNumber: result.botNumber,
		error: result.error,
	};

	if (result.available && !settings.callmebotStatus?.notifiedAt) {
		await notify(
			'CallMeBot ya tiene cupos: activa WhatsApp para tu portafolio',
			[
				'CallMeBot volvió a aceptar números.',
				'',
				`1. Agrega a tus contactos el número del bot: ${result.botNumber}`,
				'2. Envíale por WhatsApp: I allow callmebot to send me messages',
				'3. Copia la API key que te responde y pégala en https://dmontoya.dev/admin/whatsapp',
				'',
				'Con el modo «Automático», el formulario empezará a usar CallMeBot en cuanto guardes la clave.',
			].join('\n'),
		);
		status.notifiedAt = new Date().toISOString();
	}

	await saveWhatsAppSettings({ callmebotStatus: status });
}
