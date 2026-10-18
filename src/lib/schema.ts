/**
 * Definición de las colecciones editables desde /admin.
 * Cada documento se guarda en R2 como Markdown con frontmatter YAML:
 *   content/profile.md                 (único)
 *   content/skills.md                  (único)
 *   content/experience/<slug>.md
 *   content/education/<slug>.md
 *   content/projects/<slug>.md
 */

export type FieldType =
	| 'text'
	| 'textarea'
	| 'url'
	| 'email'
	| 'period' // "2024" o "2024-03"
	| 'date' // "2001-12-16"
	| 'tags' // lista separada por comas
	| 'boolean'
	| 'number'
	| 'select'
	| 'image'; // URL; en el editor se puede subir a R2

export interface FieldDef {
	name: string;
	label: string;
	type: FieldType;
	required?: boolean;
	placeholder?: string;
	help?: string;
	options?: { value: string; label: string }[];
}

export interface CollectionDef {
	label: string;
	singular: string;
	kind: 'list' | 'single';
	description: string;
	/** Campo usado como título en el listado del admin. */
	titleField?: string;
	fields: FieldDef[];
	bodyLabel: string;
	bodyHelp?: string;
}

export const COLLECTIONS = {
	profile: {
		label: 'Perfil',
		singular: 'perfil',
		kind: 'single',
		description: 'Nombre, titular, resumen profesional y datos de contacto.',
		fields: [
			{ name: 'name', label: 'Nombre', type: 'text', required: true },
			{ name: 'headline', label: 'Titular', type: 'text', required: true, placeholder: 'Ingeniero en Sistemas y Automatizaciones' },
			{ name: 'tagline', label: 'Frase corta (hero)', type: 'textarea', required: true },
			{ name: 'location', label: 'Ubicación', type: 'text' },
			{ name: 'birthDate', label: 'Fecha de nacimiento', type: 'date', placeholder: '2001-12-16' },
			{
				name: 'ageDisplay',
				label: 'Mostrar en el inicio',
				type: 'select',
				help: 'La edad se calcula sola cada día a partir de la fecha de nacimiento.',
				options: [
					{ value: 'age', label: 'Edad (se actualiza sola)' },
					{ value: 'birthdate', label: 'Fecha de nacimiento' },
					{ value: 'both', label: 'Edad y fecha' },
					{ value: 'none', label: 'No mostrar' },
				],
			},
			{ name: 'roles', label: 'Etiquetas del inicio', type: 'tags', help: 'Píldoras bajo el titular. Separadas por comas.' },
			{ name: 'avatar', label: 'Imagen del inicio (opcional)', type: 'image', help: 'Si la dejas vacía se muestra el monograma con tus iniciales.' },
			{ name: 'availability', label: 'Disponibilidad', type: 'text', placeholder: 'Abierto a nuevas oportunidades' },
			{ name: 'focus', label: 'Áreas de enfoque', type: 'tags', help: 'Separadas por comas.' },
			{ name: 'email', label: 'Correo público', type: 'email' },
			{ name: 'phone', label: 'Teléfono visible', type: 'text', placeholder: '+506 8686-1329' },
			{ name: 'whatsapp', label: 'WhatsApp (solo dígitos, con código de país)', type: 'text', placeholder: '50686861329' },
			{ name: 'whatsappMessage', label: 'Mensaje inicial de WhatsApp', type: 'text' },
			{ name: 'linkedin', label: 'LinkedIn', type: 'url' },
			{ name: 'github', label: 'GitHub', type: 'url' },
		],
		bodyLabel: 'Sobre mí (Markdown)',
		bodyHelp: 'Se muestra en la sección «Sobre mí».',
	},
	experience: {
		label: 'Experiencia',
		singular: 'experiencia',
		kind: 'list',
		description: 'Puestos laborales y pasantías.',
		titleField: 'role',
		fields: [
			{ name: 'role', label: 'Puesto', type: 'text', required: true },
			{ name: 'company', label: 'Empresa', type: 'text', required: true },
			{ name: 'employmentType', label: 'Modalidad', type: 'text', placeholder: 'Tiempo completo · Contrato · Pasantía' },
			{ name: 'location', label: 'Ubicación', type: 'text' },
			{ name: 'start', label: 'Inicio', type: 'period', required: true, placeholder: '2026-01' },
			{ name: 'end', label: 'Fin', type: 'period', placeholder: 'Vacío = Presente' },
			{ name: 'stack', label: 'Tecnologías', type: 'tags' },
		],
		bodyLabel: 'Responsabilidades y logros (Markdown)',
		bodyHelp: 'Usa una lista con guiones. **Negrita** para destacar.',
	},
	education: {
		label: 'Educación',
		singular: 'educación',
		kind: 'list',
		description: 'Formación académica y certificaciones.',
		titleField: 'title',
		fields: [
			{ name: 'title', label: 'Título / certificación', type: 'text', required: true },
			{ name: 'institution', label: 'Institución', type: 'text', required: true },
			{
				name: 'kind',
				label: 'Tipo',
				type: 'select',
				required: true,
				options: [
					{ value: 'academic', label: 'Formación académica' },
					{ value: 'certification', label: 'Certificación' },
				],
			},
			{ name: 'status', label: 'Estado', type: 'text', placeholder: 'En curso' },
			{ name: 'start', label: 'Inicio', type: 'period', placeholder: '2020' },
			{ name: 'end', label: 'Fin', type: 'period', placeholder: 'Vacío = en curso' },
			{ name: 'credentialUrl', label: 'Enlace a la credencial', type: 'url' },
		],
		bodyLabel: 'Detalle (opcional, Markdown)',
	},
	projects: {
		label: 'Proyectos',
		singular: 'proyecto',
		kind: 'list',
		description: 'Proyectos académicos, personales o profesionales.',
		titleField: 'title',
		fields: [
			{ name: 'title', label: 'Título', type: 'text', required: true },
			{ name: 'summary', label: 'Resumen (1–2 líneas)', type: 'textarea', required: true },
			{ name: 'context', label: 'Contexto', type: 'text', placeholder: 'Universidad Fidélitas · Big Data' },
			{ name: 'date', label: 'Fecha', type: 'period', required: true, placeholder: '2025-06' },
			{ name: 'tags', label: 'Tecnologías', type: 'tags' },
			{ name: 'image', label: 'Imagen de portada', type: 'image' },
			{ name: 'imageAlt', label: 'Texto alternativo de la imagen', type: 'text' },
			{ name: 'repo', label: 'Repositorio', type: 'url' },
			{ name: 'demo', label: 'Demo', type: 'url' },
			{ name: 'featured', label: 'Destacado en inicio', type: 'boolean' },
			{ name: 'order', label: 'Orden manual (opcional)', type: 'number', help: 'Menor número = aparece primero.' },
		],
		bodyLabel: 'Descripción completa (Markdown)',
	},
	skills: {
		label: 'Habilidades',
		singular: 'habilidades',
		kind: 'single',
		description: 'Stack técnico agrupado por área.',
		fields: [],
		bodyLabel: 'Habilidades (Markdown)',
		bodyHelp: 'Cada grupo es un título «## Grupo» seguido de una lista «- elemento».',
	},
} satisfies Record<string, CollectionDef>;

export type CollectionName = keyof typeof COLLECTIONS;
export type ListCollection = 'experience' | 'education' | 'projects';
export type SingleCollection = 'profile' | 'skills';

export function isCollection(name: string | undefined): name is CollectionName {
	return !!name && Object.hasOwn(COLLECTIONS, name);
}

export function getCollectionDef(name: CollectionName): CollectionDef {
	return COLLECTIONS[name];
}

export function slugify(input: string): string {
	return input
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

export function isValidSlug(slug: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80;
}

/** Convierte los valores de un formulario en el frontmatter tipado de la colección. */
export function formToData(def: CollectionDef, form: FormData): { data: Record<string, unknown>; errors: string[] } {
	const data: Record<string, unknown> = {};
	const errors: string[] = [];

	for (const field of def.fields) {
		const raw = form.get(field.name);
		const value = typeof raw === 'string' ? raw.trim() : '';

		switch (field.type) {
			case 'boolean':
				data[field.name] = raw === 'on' || raw === 'true';
				continue;
			case 'tags':
				data[field.name] = value
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean);
				continue;
			case 'number':
				if (value !== '') {
					const n = Number(value);
					if (Number.isFinite(n)) data[field.name] = n;
					else errors.push(`«${field.label}» debe ser un número.`);
				}
				continue;
			case 'period':
				if (value !== '' && !/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(value)) {
					errors.push(`«${field.label}» debe tener el formato AAAA o AAAA-MM.`);
				}
				break;
			case 'date':
				if (value !== '' && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
					errors.push(`«${field.label}» debe tener el formato AAAA-MM-DD.`);
				}
				break;
			case 'url':
			case 'image':
				if (value !== '' && !/^(https?:\/\/|\/)/.test(value)) {
					errors.push(`«${field.label}» debe ser una URL (https://…) o una ruta que empiece con /.`);
				}
				break;
			case 'email':
				if (value !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
					errors.push(`«${field.label}» no es un correo válido.`);
				}
				break;
		}

		if (field.required && value === '') errors.push(`«${field.label}» es obligatorio.`);
		if (value !== '') data[field.name] = value;
	}

	return { data, errors };
}
