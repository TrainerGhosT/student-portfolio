import {
	siAngular, siAstro, siCloudflare, siCloudflarepages, siCloudflareworkers, siCss, siDocker, siDotnet, siGit, siGithub,
	siHtml5, siJavascript, siJsonwebtokens, siJupyter, siLinux, siMysql, siNestjs, siNodedotjs, siNumpy, siOpenjdk,
	siPandas, siPostgresql, siPython, siReact, siScikitlearn, siSqlite, siTailwindcss, siTypeorm, siTypescript, siVite,
	siVuedotjs, type SimpleIcon,
} from 'simple-icons';
import {
	AppWindow, BrainCircuit, ChartColumn, Cloud, Database, LayoutGrid, Lock, Network, Plug, Server, Table2,
} from 'lucide-static';

/**
 * Logo para cada tecnología (por nombre, sin distinguir mayúsculas).
 * Las marcas de Simple Icons (CC0) se muestran con su color; las que no existen
 * en Simple Icons (AWS, Microsoft, Oracle…) usan un ícono genérico de Lucide.
 */
type TechIcon = { kind: 'brand'; icon: SimpleIcon } | { kind: 'generic'; svg: string };

const brand = (icon: SimpleIcon): TechIcon => ({ kind: 'brand', icon });
const generic = (svg: string): TechIcon => ({ kind: 'generic', svg });

const MAP: Record<string, TechIcon> = {
	'cloudflare workers': brand(siCloudflareworkers),
	'cloudflare pages': brand(siCloudflarepages),
	'cloudflare r2': brand(siCloudflare),
	cloudflare: brand(siCloudflare),
	'aws s3': generic(Cloud),
	aws: generic(Cloud),
	'aws (s3, cloud functions)': generic(Cloud),
	git: brand(siGit),
	github: brand(siGithub),
	'git y github': brand(siGithub),
	'git / github': brand(siGithub),
	linux: brand(siLinux),
	'windows server': generic(Server),
	windows: generic(AppWindow),
	react: brand(siReact),
	vue: brand(siVuedotjs),
	'vue.js': brand(siVuedotjs),
	angular: brand(siAngular),
	'angular 18': brand(siAngular),
	typescript: brand(siTypescript),
	javascript: brand(siJavascript),
	'tailwind css': brand(siTailwindcss),
	tailwindcss: brand(siTailwindcss),
	vite: brand(siVite),
	astro: brand(siAstro),
	python: brand(siPython),
	'node.js': brand(siNodedotjs),
	nodejs: brand(siNodedotjs),
	nestjs: brand(siNestjs),
	'c# / .net': brand(siDotnet),
	'c# / asp.net': brand(siDotnet),
	'asp.net': brand(siDotnet),
	'.net': brand(siDotnet),
	'c#': brand(siDotnet),
	java: brand(siOpenjdk),
	'power apps': generic(LayoutGrid),
	'power bi': generic(ChartColumn),
	mysql: brand(siMysql),
	postgresql: brand(siPostgresql),
	sqlite: brand(siSqlite),
	'sql server': generic(Database),
	sql: generic(Database),
	'data warehouse': generic(Database),
	'modelado relacional': generic(Table2),
	'modelado dimensional': generic(Table2),
	'machine learning': generic(BrainCircuit),
	'data science': brand(siJupyter),
	'scikit-learn': brand(siScikitlearn),
	pandas: brand(siPandas),
	numpy: brand(siNumpy),
	jupyter: brand(siJupyter),
	typeorm: brand(siTypeorm),
	jwt: brand(siJsonwebtokens),
	criptografía: generic(Lock),
	sockets: generic(Plug),
	tkinter: generic(AppWindow),
	html: brand(siHtml5),
	html5: brand(siHtml5),
	'html y css': brand(siHtml5),
	css: brand(siCss),
	docker: brand(siDocker),
	redes: generic(Network),
};

/** Pon `false` para mostrar las tecnologías solo con texto (sin logo). */
export const SHOW_TECH_LOGOS = true;

export function techIcon(name: string): TechIcon | null {
	return MAP[name.trim().toLowerCase()] ?? null;
}

/** Colores de marca muy oscuros (o muy claros) se reemplazan por el color del texto para que se vean en ambos temas. */
export function brandColor(hex: string): string {
	const n = parseInt(hex, 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return lum < 0.03 || lum > 0.85 ? 'currentColor' : `#${hex}`;
}
