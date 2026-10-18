import type { Profile } from './content';

export interface WhatsAppDraft {
	name: string;
	subject?: string;
	message: string;
	email?: string;
	company?: string;
}

/** Arma el enlace wa.me con el mensaje del formulario ya escrito. */
export function whatsappUrl(phone: string, draft?: WhatsAppDraft | string): string {
	const digits = phone.replace(/\D/g, '');
	let text = '';
	if (typeof draft === 'string') text = draft;
	else if (draft) {
		const lines = [
			`Hola Dylan, soy ${draft.name}${draft.company ? ` (${draft.company})` : ''}.`,
			draft.subject ? `*Asunto:* ${draft.subject}` : '',
			'',
			draft.message,
			draft.email ? `\nMi correo: ${draft.email}` : '',
		];
		text = lines.filter((l, i) => l !== '' || i === 2).join('\n').trim();
	}
	return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function profileWhatsapp(profile: Profile): string | null {
	return profile.whatsapp ? profile.whatsapp.replace(/\D/g, '') : null;
}
