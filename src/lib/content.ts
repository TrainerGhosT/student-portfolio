import { env } from 'cloudflare:workers';
import { marked } from 'marked';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ListCollection, SingleCollection } from './schema';

/* -------------------------------------------------------------------------- */
/*  Tipos                                                                     */
/* -------------------------------------------------------------------------- */

export interface Doc<T = Record<string, unknown>> {
	slug: string;
	data: T;
	body: string;
}

export interface Profile {
	name: string;
	headline: string;
	tagline: string;
	location?: string;
	birthDate?: string;
	ageDisplay?: 'age' | 'birthdate' | 'both' | 'none';
	roles?: string[];
	avatar?: string;
	availability?: string;
	focus?: string[];
	email?: string;
	phone?: string;
	whatsapp?: string;
	whatsappMessage?: string;
	linkedin?: string;
	github?: string;
}

export interface Experience {
	role: string;
	company: string;
	employmentType?: string;
	location?: string;
	start: string;
	end?: string;
	stack?: string[];
}

export interface Education {
	title: string;
	institution: string;
	kind: 'academic' | 'certification';
	status?: string;
	start?: string;
	end?: string;
	credentialUrl?: string;
}

export interface Project {
	title: string;
	summary: string;
	context?: string;
	date: string;
	tags?: string[];
	image?: string;
	imageAlt?: string;
	repo?: string;
	demo?: string;
	featured?: boolean;
	order?: number;
}

export interface SkillGroup {
	name: string;
	items: string[];
}

interface DataMap {
	profile: Profile;
	skills: Record<string, never>;
	experience: Experience;
	education: Education;
	projects: Project;
}

/* -------------------------------------------------------------------------- */
/*  Markdown + frontmatter                                                    */
/* -------------------------------------------------------------------------- */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseDoc(raw: string): { data: Record<string, unknown>; body: string } {
	const match = raw.match(FRONTMATTER);
	if (!match) return { data: {}, body: raw.trim() };
	const data = (parseYaml(match[1]) ?? {}) as Record<string, unknown>;
	return { data, body: raw.slice(match[0].length).trim() };
}

export function serializeDoc(data: Record<string, unknown>, body: string): string {
	const clean = Object.fromEntries(
		Object.entries(data).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)),
	);
	return `---\n${stringifyYaml(clean).trim()}\n---\n\n${body.trim()}\n`;
}

marked.setOptions({ gfm: true, breaks: false });

/** Renderiza Markdown escrito por el dueño del sitio (contenido de confianza). */
export function renderMarkdown(md: string | undefined): string {
	if (!md) return '';
	return marked.parse(md, { async: false });
}

/** Extrae grupos «## Título» + lista «- item» del documento de habilidades. */
export function parseSkillGroups(md: string): SkillGroup[] {
	const groups: SkillGroup[] = [];
	let current: SkillGroup | null = null;
	for (const line of md.split(/\r?\n/)) {
		const heading = line.match(/^#{2,3}\s+(.+)$/);
		const item = line.match(/^\s*[-*]\s+(.+)$/);
		if (heading) {
			current = { name: heading[1].trim(), items: [] };
			groups.push(current);
		} else if (item && current) {
			current.items.push(item[1].trim());
		}
	}
	return groups.filter((g) => g.items.length > 0);
}

/* -------------------------------------------------------------------------- */
/*  Fechas tipo "2024" o "2024-03"                                            */
/* -------------------------------------------------------------------------- */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatPeriod(value?: string | number): string {
	if (value === undefined || value === null || value === '') return '';
	const [y, m] = String(value).split('-');
	return m ? `${MONTHS[Number(m) - 1]} ${y}` : y;
}

export function formatRange(start?: string, end?: string, ongoing = 'Presente'): string {
	const s = formatPeriod(start);
	const e = end ? formatPeriod(end) : ongoing;
	if (!s) return end ? e : '';
	return s === e ? s : `${s} — ${e}`;
}

/** Edad cumplida hoy (zona horaria de Costa Rica). Se calcula en cada visita, así que se actualiza sola. */
export function computeAge(birthDate: string, now = new Date()): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
	if (!m) return null;
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(now); // AAAA-MM-DD
	const [ty, tm, td] = today.split('-').map(Number);
	const [by, bm, bd] = [Number(m[1]), Number(m[2]), Number(m[3])];
	let age = ty - by;
	if (tm < bm || (tm === bm && td < bd)) age--;
	return age;
}

const LONG_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function formatBirthDate(birthDate: string): string {
	const [y, m, d] = birthDate.split('-').map(Number);
	return `${d} de ${LONG_MONTHS[m - 1]} de ${y}`;
}

function periodKey(value?: string | number): string {
	if (!value) return '9999-99'; // sin fecha de fin = en curso → primero
	const [y, m = '00'] = String(value).split('-');
	return `${y}-${m.padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/*  Acceso a R2 con caché en memoria                                          */
/* -------------------------------------------------------------------------- */

const PREFIX = 'content/';
const CACHE_TTL_MS = 60_000;

type Store = Map<string, string>; // key de R2 → contenido crudo
let cache: { at: number; store: Store; source: 'r2' | 'seed' } | null = null;

const seedFiles = import.meta.glob('../seed/content/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

export function getSeedStore(): Store {
	const store: Store = new Map();
	for (const [path, raw] of Object.entries(seedFiles)) {
		const key = PREFIX + path.split('/seed/content/')[1];
		store.set(key, raw);
	}
	return store;
}

export function bucket(): R2Bucket {
	return env.CONTENT;
}

async function loadStore(): Promise<{ store: Store; source: 'r2' | 'seed' }> {
	if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;

	const store: Store = new Map();
	try {
		const keys: string[] = [];
		let cursor: string | undefined;
		do {
			const page = await bucket().list({ prefix: PREFIX, cursor });
			keys.push(...page.objects.map((o) => o.key).filter((k) => k.endsWith('.md')));
			cursor = page.truncated ? page.cursor : undefined;
		} while (cursor);

		const bodies = await Promise.all(keys.map(async (k) => [k, await (await bucket().get(k))?.text()] as const));
		for (const [k, text] of bodies) if (text !== undefined) store.set(k, text);
	} catch (err) {
		console.error('No se pudo leer R2, usando contenido semilla', err);
	}

	// Bucket vacío (recién desplegado) → mostramos el contenido semilla incluido en el build.
	const result = store.size > 0 ? { store, source: 'r2' as const } : { store: getSeedStore(), source: 'seed' as const };
	cache = { at: Date.now(), ...result };
	return result;
}

export function invalidateContentCache() {
	cache = null;
}

export async function contentSource(): Promise<'r2' | 'seed'> {
	return (await loadStore()).source;
}

function toDoc<T>(key: string, raw: string): Doc<T> {
	const { data, body } = parseDoc(raw);
	const slug = key.split('/').pop()!.replace(/\.md$/, '');
	return { slug, data: data as T, body };
}

export async function getSingle<C extends SingleCollection>(name: C): Promise<Doc<DataMap[C]> | null> {
	const { store } = await loadStore();
	const raw = store.get(`${PREFIX}${name}.md`);
	return raw ? toDoc<DataMap[C]>(`${name}.md`, raw) : null;
}

export async function getEntries<C extends ListCollection>(name: C): Promise<Doc<DataMap[C]>[]> {
	const { store } = await loadStore();
	const prefix = `${PREFIX}${name}/`;
	const docs = [...store.entries()]
		.filter(([k]) => k.startsWith(prefix))
		.map(([k, raw]) => toDoc<DataMap[C]>(k, raw));
	return sortEntries(name, docs);
}

export async function getEntry<C extends ListCollection>(name: C, slug: string): Promise<Doc<DataMap[C]> | null> {
	const { store } = await loadStore();
	const raw = store.get(`${PREFIX}${name}/${slug}.md`);
	return raw ? toDoc<DataMap[C]>(`${slug}.md`, raw) : null;
}

function sortEntries<C extends ListCollection>(name: C, docs: Doc<DataMap[C]>[]): Doc<DataMap[C]>[] {
	return docs.sort((a, b) => {
		const da = a.data as Record<string, any>;
		const db = b.data as Record<string, any>;
		if (name === 'projects') {
			const oa = da.order ?? Number.POSITIVE_INFINITY;
			const ob = db.order ?? Number.POSITIVE_INFINITY;
			if (oa !== ob) return oa - ob;
			return periodKey(db.date).localeCompare(periodKey(da.date));
		}
		// experiencia / educación: los vigentes primero, luego por fecha de fin e inicio
		const byEnd = periodKey(db.end).localeCompare(periodKey(da.end));
		return byEnd !== 0 ? byEnd : periodKey(db.start).localeCompare(periodKey(da.start));
	});
}

/* -------------------------------------------------------------------------- */
/*  Escritura (solo desde /api/admin)                                         */
/* -------------------------------------------------------------------------- */

export function keyFor(collection: ListCollection | SingleCollection, slug?: string): string {
	return slug ? `${PREFIX}${collection}/${slug}.md` : `${PREFIX}${collection}.md`;
}

export async function saveDoc(key: string, data: Record<string, unknown>, body: string) {
	await bucket().put(key, serializeDoc(data, body), {
		httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
	});
	invalidateContentCache();
}

export async function deleteDoc(key: string) {
	await bucket().delete(key);
	invalidateContentCache();
}

/** Copia el contenido semilla a R2 (solo claves que aún no existen). */
export async function importSeed(): Promise<number> {
	let written = 0;
	for (const [key, raw] of getSeedStore()) {
		const exists = await bucket().head(key);
		if (!exists) {
			await bucket().put(key, raw, { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } });
			written++;
		}
	}
	invalidateContentCache();
	return written;
}

/* -------------------------------------------------------------------------- */
/*  Archivos                                                                  */
/* -------------------------------------------------------------------------- */

export const CV_KEY = 'files/cv.pdf';
export const CV_FALLBACK = '/files/Dylan_Montoya_CV.pdf';
