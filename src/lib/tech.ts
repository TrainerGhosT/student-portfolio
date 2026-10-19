import { bucket } from './content';
import seed from '../seed/tech-icons.json';

/**
 * Catálogo de tecnologías con su ícono (editable en /admin/tecnologias).
 *  - svgl:   logo de marca de https://svgl.app (con variante clara/oscura si existe).
 *  - lucide: ícono genérico de https://lucide.dev (usa el color del texto).
 *  - none:   sin ícono.
 * El catálogo inicial está en src/seed/tech-icons.json; lo que cambies en el admin
 * se guarda en R2 (settings/tech-icons.json) y tiene prioridad.
 */
export type TechSource = 'svgl' | 'lucide' | 'none';

export interface TechEntry {
	name: string;
	source: TechSource;
	/** Título en svgl o nombre del ícono en Lucide. */
	ref?: string;
	/** Markup SVG (variante clara o única). */
	light?: string;
	/** Markup SVG para tema oscuro (solo algunos logos de svgl). */
	dark?: string;
}

/** Pon `false` para mostrar las tecnologías solo con texto (sin logo). */
export const SHOW_TECH_LOGOS = true;

const KEY = 'settings/tech-icons.json';
const CACHE_TTL_MS = 60_000;
const seedCatalog = seed as Record<string, TechEntry>;

let cache: { at: number; data: Record<string, TechEntry> } | null = null;

export const techKey = (name: string) => name.trim().toLowerCase();

async function readOverrides(): Promise<Record<string, TechEntry | null>> {
	try {
		const obj = await bucket().get(KEY);
		return obj ? JSON.parse(await obj.text()) : {};
	} catch (err) {
		console.error('No se pudo leer el catálogo de íconos', err);
		return {};
	}
}

/** Catálogo completo: semilla + cambios del admin (un valor null elimina la entrada). */
export async function getTechCatalog(): Promise<Record<string, TechEntry>> {
	if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
	const overrides = await readOverrides();
	const data: Record<string, TechEntry> = { ...seedCatalog };
	for (const [k, v] of Object.entries(overrides)) {
		if (v === null) delete data[k];
		else data[k] = v;
	}
	cache = { at: Date.now(), data };
	return data;
}

export async function getTechEntry(name: string): Promise<TechEntry | null> {
	return (await getTechCatalog())[techKey(name)] ?? null;
}

async function writeOverride(key: string, value: TechEntry | null | undefined) {
	const overrides = await readOverrides();
	if (value === undefined) delete overrides[key];
	else overrides[key] = value;
	await bucket().put(KEY, JSON.stringify(overrides), { httpMetadata: { contentType: 'application/json' } });
	cache = null;
}

export const saveTechEntry = (entry: TechEntry) => writeOverride(techKey(entry.name), entry);
/** Quita la tecnología del catálogo (también si venía de la semilla). */
export const removeTechEntry = (name: string) => writeOverride(techKey(name), null);
/** Vuelve al ícono de la semilla (o lo quita si no estaba en ella). */
export const resetTechEntry = (name: string) => writeOverride(techKey(name), undefined);
export const isSeeded = (name: string) => techKey(name) in seedCatalog;

/* -------------------------------------------------------------------------- */
/*  SVG                                                                        */
/* -------------------------------------------------------------------------- */

/** Limpia un SVG descargado: sin scripts, eventos, foreignObject ni enlaces javascript:. */
export function sanitizeSvg(svg: string): string {
	const start = svg.indexOf('<svg');
	if (start < 0) throw new Error('El archivo no es un SVG.');
	return svg
		.slice(start)
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
		.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
		.replace(/(href|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '')
		.trim();
}

export const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/* -------------------------------------------------------------------------- */
/*  Proveedores (usados por el admin)                                           */
/* -------------------------------------------------------------------------- */

const SVGL_API = 'https://api.svgl.app';
const SVGL_SITE = 'https://svgl.app';
const SVGL_RAW = 'https://raw.githubusercontent.com/pheralb/svgl/main/static';
export const LUCIDE_VERSION = '1.59.0';
const LUCIDE_CDN = `https://unpkg.com/lucide-static@${LUCIDE_VERSION}`;

export interface SvglResult {
	title: string;
	category: string;
	light: string;
	dark?: string;
}

const absolute = (route: string) => (route.startsWith('http') ? route : SVGL_SITE + route);

export async function searchSvgl(query: string): Promise<SvglResult[]> {
	let res: Response;
	try {
		res = await fetch(`${SVGL_API}?search=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
	} catch {
		throw new Error('No se pudo conectar con svgl.app. Revisa tu conexión a internet.');
	}
	if (!res.ok) throw new Error(`svgl respondió ${res.status}`);
	const items = (await res.json()) as {
		title: string;
		category: string | string[];
		route: string | { light: string; dark: string };
	}[];
	return items.slice(0, 40).map((i) => ({
		title: i.title,
		category: Array.isArray(i.category) ? i.category.join(', ') : i.category,
		light: absolute(typeof i.route === 'string' ? i.route : i.route.light),
		dark: typeof i.route === 'string' ? undefined : absolute(i.route.dark),
	}));
}

/** Descarga un SVG de svgl (con respaldo en el repositorio de GitHub). */
export async function fetchSvglSvg(url: string): Promise<string> {
	const u = new URL(url);
	if (u.hostname !== 'svgl.app' || !u.pathname.startsWith('/library/') || !u.pathname.endsWith('.svg')) {
		throw new Error('URL de svgl no válida.');
	}
	for (const candidate of [u.toString(), SVGL_RAW + u.pathname]) {
		try {
			const res = await fetch(candidate);
			if (res.ok) return sanitizeSvg(await res.text());
		} catch {}
	}
	throw new Error('No se pudo descargar el SVG de svgl.');
}

let lucideTags: Record<string, string[]> | null = null;

export async function searchLucide(query: string): Promise<string[]> {
	if (!lucideTags) {
		const res = await fetch(`${LUCIDE_CDN}/tags.json`).catch(() => {
			throw new Error('No se pudo conectar con unpkg.com para cargar los íconos de Lucide.');
		});
		if (!res.ok) throw new Error(`No se pudo cargar la lista de Lucide (${res.status}).`);
		lucideTags = (await res.json()) as Record<string, string[]>;
	}
	const q = query.trim().toLowerCase();
	const names = Object.keys(lucideTags);
	if (!q) return names.slice(0, 60);
	const exact = names.filter((n) => n.includes(q));
	const byTag = names.filter((n) => !n.includes(q) && lucideTags![n].some((t) => t.toLowerCase().includes(q)));
	return [...exact, ...byTag].slice(0, 60);
}

export const lucidePreviewUrl = (name: string) => `${LUCIDE_CDN}/icons/${name}.svg`;

export async function fetchLucideSvg(name: string): Promise<string> {
	if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Nombre de ícono no válido.');
	const res = await fetch(lucidePreviewUrl(name));
	if (!res.ok) throw new Error(`Lucide no tiene el ícono «${name}».`);
	return sanitizeSvg(await res.text());
}
