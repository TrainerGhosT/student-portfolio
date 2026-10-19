import { env } from 'cloudflare:workers';
import { bucket } from './content';

/**
 * Configuración de WhatsApp editable desde /admin/whatsapp.
 * Se guarda en R2 (privado) en settings/whatsapp.json. Los secretos de Wrangler
 * (WHATSAPP_PHONE, CALLMEBOT_APIKEY, META_WA_*) sirven como valores por defecto.
 */
export type WhatsAppMode = 'auto' | 'callmebot' | 'meta' | 'off';

export interface WhatsAppSettings {
	mode: WhatsAppMode;
	phone?: string;
	callmebotApiKey?: string;
	meta?: {
		token?: string;
		phoneNumberId?: string;
		template?: string;
		lang?: string;
	};
	callmebotStatus?: {
		checkedAt?: string;
		available?: boolean;
		botNumber?: string;
		notifiedAt?: string;
		error?: string;
	};
	updatedAt?: string;
}

const KEY = 'settings/whatsapp.json';

export async function getWhatsAppSettings(): Promise<WhatsAppSettings> {
	let stored: Partial<WhatsAppSettings> = {};
	try {
		const obj = await bucket().get(KEY);
		if (obj) stored = JSON.parse(await obj.text());
	} catch (err) {
		console.error('No se pudo leer la configuración de WhatsApp', err);
	}
	return {
		mode: stored.mode ?? ((env.WHATSAPP_PROVIDER as WhatsAppMode) || 'auto'),
		phone: stored.phone || env.WHATSAPP_PHONE || undefined,
		callmebotApiKey: stored.callmebotApiKey || env.CALLMEBOT_APIKEY || undefined,
		meta: {
			token: stored.meta?.token || env.META_WA_TOKEN || undefined,
			phoneNumberId: stored.meta?.phoneNumberId || env.META_WA_PHONE_NUMBER_ID || undefined,
			template: stored.meta?.template || env.META_WA_TEMPLATE || undefined,
			lang: stored.meta?.lang || env.META_WA_TEMPLATE_LANG || 'es',
		},
		callmebotStatus: stored.callmebotStatus,
		updatedAt: stored.updatedAt,
	};
}

/** Guarda solo lo que se guardó en R2 (no copia los secretos de Wrangler). */
export async function saveWhatsAppSettings(patch: Partial<WhatsAppSettings>): Promise<void> {
	let stored: Partial<WhatsAppSettings> = {};
	try {
		const obj = await bucket().get(KEY);
		if (obj) stored = JSON.parse(await obj.text());
	} catch {}
	const next = {
		...stored,
		...patch,
		meta: { ...stored.meta, ...patch.meta },
		callmebotStatus: { ...stored.callmebotStatus, ...patch.callmebotStatus },
		updatedAt: new Date().toISOString(),
	};
	await bucket().put(KEY, JSON.stringify(next, null, 2), { httpMetadata: { contentType: 'application/json' } });
}

export const callmebotReady = (s: WhatsAppSettings) => !!(s.phone && s.callmebotApiKey);
export const metaReady = (s: WhatsAppSettings) => !!(s.phone && s.meta?.token && s.meta?.phoneNumberId && s.meta?.template);

/** Proveedor que se usará realmente según el modo y lo que esté configurado. */
export function activeProvider(s: WhatsAppSettings): 'callmebot' | 'meta' | null {
	if (s.mode === 'off') return null;
	if (s.mode === 'callmebot') return callmebotReady(s) ? 'callmebot' : null;
	if (s.mode === 'meta') return metaReady(s) ? 'meta' : null;
	// auto: CallMeBot (gratis) en cuanto esté activo; si no, WhatsApp Cloud API.
	if (callmebotReady(s)) return 'callmebot';
	if (metaReady(s)) return 'meta';
	return null;
}
