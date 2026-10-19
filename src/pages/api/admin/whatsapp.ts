import type { APIRoute } from 'astro';
import { sendNotificationEmail } from '../../../lib/mail';
import { getWhatsAppSettings, saveWhatsAppSettings, type WhatsAppMode } from '../../../lib/settings';
import { runCallMeBotWatch, sendWhatsAppText } from '../../../lib/whatsapp';

const back = (request: Request, params: Record<string, string>) =>
	Response.redirect(new URL(`/admin/whatsapp?${new URLSearchParams(params)}`, request.url), 303);

/** Guardar configuración, enviar un mensaje de prueba o revisar CallMeBot. */
export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData();
	const action = String(form.get('_action') ?? 'save');
	const get = (k: string) => String(form.get(k) ?? '').trim();

	if (action === 'test') {
		const { status, provider } = await sendWhatsAppText('*Prueba del portafolio*\nSi lees esto, los mensajes del formulario te llegarán a WhatsApp.');
		const label = provider === 'callmebot' ? 'CallMeBot' : provider === 'meta' ? 'WhatsApp Cloud API' : 'ningún proveedor';
		return status === 'sent'
			? back(request, { ok: `Mensaje de prueba enviado con ${label}. Revisa tu WhatsApp.` })
			: back(request, { error: status === 'skipped' ? 'No hay ningún proveedor configurado todavía.' : `Falló el envío con ${label}. Revisa los datos.` });
	}

	if (action === 'check') {
		await runCallMeBotWatch(sendNotificationEmail);
		const s = await getWhatsAppSettings();
		return back(request, {
			ok: s.callmebotStatus?.available
				? `¡CallMeBot tiene cupos! Número del bot: ${s.callmebotStatus.botNumber}`
				: 'CallMeBot sigue sin cupos. Se revisará solo cada día y te avisaré por correo.',
		});
	}

	const mode = (['auto', 'callmebot', 'meta', 'off'].includes(get('mode')) ? get('mode') : 'auto') as WhatsAppMode;
	const phone = get('phone').replace(/[^\d+]/g, '');
	if (phone && !/^\+?\d{8,15}$/.test(phone)) return back(request, { error: 'El número debe incluir el código de país, p. ej. +50686861329.' });

	// Los campos secretos vacíos conservan el valor anterior; "borrar" los elimina.
	const keep = (k: string) => (form.get(`clear_${k}`) ? '' : get(k) || undefined);
	const callmebotApiKey = keep('callmebotApiKey');
	const token = keep('metaToken');

	await saveWhatsAppSettings({
		mode,
		phone: phone || undefined,
		...(callmebotApiKey !== undefined ? { callmebotApiKey } : {}),
		meta: {
			...(token !== undefined ? { token } : {}),
			phoneNumberId: get('metaPhoneNumberId') || undefined,
			template: get('metaTemplate') || undefined,
			lang: get('metaLang') || 'es',
		},
	});
	return back(request, { ok: 'Configuración guardada.' });
};
