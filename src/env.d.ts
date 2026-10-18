/// <reference types="astro/client" />

declare namespace App {
	interface Locals {
		/** Correo del administrador autenticado (solo en rutas /admin y /api/admin). */
		adminEmail?: string;
	}
}

// Secretos (wrangler secret put / .dev.vars). `wrangler types` los agrega al leer .dev.vars,
// pero los declaramos aquí para que el proyecto compile aunque .dev.vars no exista.
// En runtime pueden venir vacíos: el código siempre valida antes de usarlos.
declare namespace Cloudflare {
	interface Env {
		RESEND_API_KEY: string;
		TURNSTILE_SECRET_KEY: string;
	}
}
