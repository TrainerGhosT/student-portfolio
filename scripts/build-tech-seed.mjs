/**
 * Genera src/seed/tech-icons.json: íconos iniciales de las tecnologías.
 * - Marcas: SVG de svgl (https://svgl.app), descargados del repositorio pheralb/svgl.
 * - Genéricos: íconos de Lucide (paquete lucide-static).
 * Uso: node scripts/build-tech-seed.mjs
 * Luego cada ícono se puede cambiar desde /admin/tecnologias.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const lucideDir = path.dirname(require.resolve('lucide-static/package.json'));
const RAW = 'https://raw.githubusercontent.com/pheralb/svgl/main/static';

// nombre en el portafolio → { svgl: título exacto en svgl } | { lucide: nombre del ícono }
const MAP = {
	'Cloudflare Workers': { svgl: 'Cloudflare Workers' },
	'Cloudflare Pages': { svgl: 'Cloudflare' },
	'Cloudflare R2': { svgl: 'Cloudflare' },
	'AWS S3': { svgl: 'Amazon Web Services' },
	Git: { svgl: 'Git' },
	GitHub: { svgl: 'GitHub' },
	Linux: { svgl: 'Linux' },
	'Windows Server': { svgl: 'Windows' },
	React: { svgl: 'React' },
	Vue: { svgl: 'Vue' },
	Angular: { svgl: 'Angular' },
	TypeScript: { svgl: 'TypeScript' },
	JavaScript: { svgl: 'JavaScript' },
	'Tailwind CSS': { svgl: 'Tailwind CSS' },
	Vite: { svgl: 'Vite' },
	HTML: { svgl: 'HTML5' },
	CSS: { svgl: 'CSS (New)' },
	Python: { svgl: 'Python' },
	'Node.js': { svgl: 'Node.js' },
	NestJS: { svgl: 'NestJS' },
	'C# / .NET': { svgl: 'Microsoft .NET' },
	'C# / ASP.NET': { svgl: 'Microsoft .NET' },
	Java: { svgl: 'Java' },
	'SQL Server': { svgl: 'Microsoft SQL Server' },
	MySQL: { svgl: 'MySQL' },
	TypeORM: { svgl: 'TypeORM' },
	Astro: { svgl: 'Astro' },
	Docker: { svgl: 'Docker' },
	'Power Apps': { lucide: 'layout-grid' },
	'Power BI': { lucide: 'chart-column' },
	SQL: { lucide: 'database' },
	'Data Warehouse': { lucide: 'warehouse' },
	'Modelado relacional': { lucide: 'table-2' },
	'Modelado dimensional': { lucide: 'boxes' },
	'Machine Learning': { lucide: 'brain-circuit' },
	'Data Science': { lucide: 'chart-scatter' },
	Criptografía: { lucide: 'lock-keyhole' },
	Sockets: { lucide: 'cable' },
	Tkinter: { lucide: 'app-window' },
};

const catalogTs = await (await fetch('https://raw.githubusercontent.com/pheralb/svgl/main/src/data/svgs.ts')).text();
const svgs = new Function(catalogTs.replace(/^import.*$/m, '').replace(/export const svgs:[^=]*=/, 'return '))();
const byTitle = new Map(svgs.map((s) => [s.title.trim(), s]));

const get = async (route) => {
	const res = await fetch(RAW + route);
	if (!res.ok) throw new Error(`${route}: ${res.status}`);
	return (await res.text()).trim();
};

const out = {};
for (const [name, ref] of Object.entries(MAP)) {
	if (ref.svgl) {
		const item = byTitle.get(ref.svgl);
		if (!item) throw new Error(`svgl no tiene «${ref.svgl}»`);
		const route = item.route;
		const light = await get(typeof route === 'string' ? route : route.light);
		const dark = typeof route === 'string' ? undefined : await get(route.dark);
		out[name.toLowerCase()] = { name, source: 'svgl', ref: ref.svgl, light, ...(dark ? { dark } : {}) };
	} else {
		const svg = (await readFile(path.join(lucideDir, 'icons', `${ref.lucide}.svg`), 'utf8')).trim();
		out[name.toLowerCase()] = { name, source: 'lucide', ref: ref.lucide, light: svg };
	}
	console.log('✓', name);
}

await writeFile('src/seed/tech-icons.json', JSON.stringify(out, null, '\t') + '\n');
console.log(`\n${Object.keys(out).length} íconos guardados en src/seed/tech-icons.json`);
