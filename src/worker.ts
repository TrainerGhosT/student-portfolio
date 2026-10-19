import { handle } from '@astrojs/cloudflare/handler';

/**
 * Punto de entrada del Worker: Astro atiende las peticiones y, una vez al día,
 * el cron revisa si CallMeBot volvió a tener cupos (ver src/lib/whatsapp.ts).
 */
export default {
	fetch(request, env, ctx) {
		return handle(request, env, ctx);
	},

	async scheduled(_controller, _env, ctx) {
		const [{ runCallMeBotWatch }, { sendNotificationEmail }] = await Promise.all([
			import('./lib/whatsapp'),
			import('./lib/mail'),
		]);
		ctx.waitUntil(runCallMeBotWatch(sendNotificationEmail));
	},
} satisfies ExportedHandler<Env>;
