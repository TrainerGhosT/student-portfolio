import type { APIRoute } from 'astro';
import { getEmailSettings, saveEmailSettings, sendEmail } from '../../../lib/mail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const back = (request: Request, params: Record<string, string>) =>
	Response.redirect(new URL(`/admin/correo?${new URLSearchParams(params)}`, request.url), 303);
const list = (v: string) =>
	v
		.split(/[,;\s]+/)
		.map((x) => x.trim())
		.filter(Boolean);

/** Guardar destinatarios o enviar un correo de prueba con Resend. */
export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData();
	const get = (k: string) => String(form.get(k) ?? '').trim();

	if (get('_action') === 'test') {
		const s = await getEmailSettings();
		const to = get('testTo') ? list(get('testTo')) : s.to;
		if (!to.length || !to.every((x) => EMAIL_RE.test(x))) return back(request, { error: 'Indica un correo válido para la prueba.' });

		const now = new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
		const result = await sendEmail(
			{
				to,
				subject: '[Portafolio] Correo de prueba',
				text: `Este es un correo de prueba enviado desde el panel del portafolio (${now}).\n\nSi lo recibes, los mensajes del formulario de contacto te llegarán aquí.`,
				tag: 'admin-test',
			},
			s,
		);
		await saveEmailSettings({ lastTest: { at: new Date().toISOString(), ok: result.status === 'sent', to: to.join(', '), detail: result.detail } });
		return result.status === 'sent'
			? back(request, { ok: `Correo de prueba enviado a ${to.join(', ')}. Revisa la bandeja (y spam).` })
			: back(request, { error: `No se pudo enviar: ${result.detail}` });
	}

	const to = list(get('to'));
	const cc = list(get('cc'));
	const bad = [...to, ...cc].find((x) => !EMAIL_RE.test(x));
	if (!to.length) return back(request, { error: 'Agrega al menos un destinatario.' });
	if (bad) return back(request, { error: `«${bad}» no es un correo válido.` });

	await saveEmailSettings({ to, cc, fromName: get('fromName') || undefined });
	return back(request, { ok: 'Configuración de correo guardada.' });
};
