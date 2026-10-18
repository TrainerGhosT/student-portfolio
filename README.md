# Portafolio — Dylan Montoya

Astro 7 + Tailwind CSS 4, desplegado como **Cloudflare Worker** (con assets estáticos).
El contenido (Markdown) vive en **Cloudflare R2** y se edita desde un panel privado en `/admin`.

| Pieza | Tecnología |
| --- | --- |
| Framework | Astro 7 (`output: 'server'`) + `@astrojs/cloudflare` 14 |
| Diseño | Plantilla «Portfolio» original de Astro (colores, fondos, tipografías Rubik + Public Sans) |
| Estilos | Tailwind CSS 4 (`@tailwindcss/vite`) conectado a las variables de la plantilla |
| Contenido | Markdown con frontmatter en R2 (bucket `portfolio-content`) |
| Admin | `/admin`, protegido con **Cloudflare Access** + validación del JWT en el Worker |
| Contacto | Un formulario, tres opciones: **correo** (Worker → Resend + copia en R2), **WhatsApp** (abre el chat con el mensaje escrito) o **ambos** |
| CV | `/cv` (visor) y `/cv.pdf` (`?descargar` para bajarlo). Se reemplaza desde el admin |

> Cloudflare Pages ya no es compatible con el adaptador de Astro (v13+). Cloudflare recomienda Workers
> con assets estáticos, que es lo que usa este proyecto: mismo despliegue desde GitHub, mismo CDN.

---

## Desarrollo local

Requisitos: Node 22.12+ y pnpm (`npm i -g pnpm`).

```bash
pnpm install
cp .dev.vars.example .dev.vars   # secretos locales (no se suben a git)
pnpm dev                         # http://localhost:4321
```

- `astro dev` corre sobre `workerd` (el mismo runtime de producción). R2 se simula localmente en `.wrangler/`.
- En local, `/admin` está abierto para poder trabajar. **En producción devuelve 404** a cualquiera que no sea tú.
- Si el bucket está vacío, el sitio muestra el contenido inicial de `src/seed/content/`.
  En `/admin` aparece el botón **«Importar contenido inicial a R2»** (también se importa solo la primera vez que guardes algo).

Scripts:

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Genera tipos de Cloudflare y levanta el servidor de desarrollo |
| `pnpm build` | Tipos + `astro check` + build |
| `pnpm preview` | Build y previsualización con Wrangler |
| `pnpm run deploy` | Build y `wrangler deploy` |

---

## Estructura

- `src/styles/tokens.css`: colores y sombras de la plantilla. Tailwind los expone como `text-gray-300`, `bg-accent-regular`, etc.
- `src/lib/tech.ts`: qué logo se muestra al lado de cada tecnología (Simple Icons; las marcas sin ícono usan uno genérico).

```
src/
  lib/
    content.ts     # lectura/escritura en R2, render de Markdown, caché de 60 s
    schema.ts      # colecciones y campos que genera el formulario del admin
    auth.ts        # verificación del JWT de Cloudflare Access
    mail.ts        # envío con Resend y verificación de Turnstile
  middleware.ts    # bloquea /admin y /api/admin si no eres tú (404)
  seed/content/    # contenido inicial (perfil, experiencia, educación, proyectos, habilidades)
  pages/
    index.astro, proyectos/, contacto.astro, cv.astro, cv.pdf.ts, media/[...key].ts
    admin/         # panel privado
    api/contact.ts # formulario público
    api/admin/     # guardar, borrar, subir archivos, vista previa
```

Claves en R2:

```
content/profile.md            content/skills.md
content/experience/<slug>.md  content/education/<slug>.md  content/projects/<slug>.md
media/<id>-<nombre>.<ext>     # imágenes subidas (se sirven en /media/…)
files/cv.pdf                  # CV vigente
messages/<fecha>-<id>.json    # copia de cada mensaje del formulario
```

---

## Puesta en producción (una sola vez)

### 1. Dominio (recomendado: Cloudflare Registrar)

1. Crea una cuenta en <https://dash.cloudflare.com> y entra a **Domain Registration → Register Domains**.
2. Busca el nombre (p. ej. `dylanmontoya.dev`) y cómpralo. Cloudflare vende a precio de costo, sin margen (aprox. US$8 el primer año y US$12 al renovar un .dev, según precios de oct. 2026).
3. Como el dominio ya queda en Cloudflare, no hay que configurar DNS ni nameservers.

Alternativa gratis el primer año: con el **GitHub Student Developer Pack** (Name.com ofrece `.dev`, `.app`, etc.).
En Name.com cambia los *nameservers* a los que te da Cloudflare (*Add a site*) y todo lo demás funciona igual.
A los 60 días puedes transferirlo a Cloudflare para renovar a precio de costo.

### 2. Cloudflare

```bash
pnpm wrangler login
pnpm wrangler r2 bucket create portfolio-content
```

Con el dominio (p. ej. `dylanmontoya.dev`) agregado a Cloudflare, descomenta en `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "dylanmontoya.dev", "custom_domain": true }],
"workers_dev": false
```

y actualiza `site` en `astro.config.mjs`.

### 3. Desplegar

Opción A — desde tu PC: `pnpm run deploy`.

Opción B — automático con GitHub (recomendado): Cloudflare → *Workers & Pages* → *Create* → *Import a repository*,
elige este repo. Build command: `pnpm build` · Deploy command: `npx wrangler deploy`. Cada push a `master` despliega.

### 4. Panel privado con Cloudflare Access (gratis hasta 50 usuarios)

1. Cloudflare → **Zero Trust** → *Access* → *Applications* → **Add an application** → *Self-hosted*.
2. Destinos: `dylanmontoya.dev/admin` **y** `dylanmontoya.dev/api/admin`.
3. Política: *Allow* → *Include* → *Emails* → tu correo. Método de login: **One-time PIN** (te llega un código al correo) o Google/GitHub.
4. Copia el **Application Audience (AUD) Tag** → `ACCESS_AUD` en `wrangler.jsonc`.
5. Copia tu team domain (`https://<equipo>.cloudflareaccess.com`) → `ACCESS_TEAM_DOMAIN`.
6. Vuelve a desplegar.

Cómo queda protegido:

- Los visitantes nunca ven enlaces al panel; el sitio público es solo lectura.
- Access intercepta `/admin*` antes de llegar al Worker.
- Aunque alguien llegara al Worker por otra vía, `src/middleware.ts` valida firma, emisor, audiencia y correo del JWT;
  si algo no coincide responde **404**.
- Astro rechaza POST de otros orígenes (`security.checkOrigin`).

### 5. Formulario de contacto

**Turnstile (anti‑spam):** Cloudflare → *Turnstile* → *Add widget* para tu dominio.
Site key → `TURNSTILE_SITE_KEY` en `wrangler.jsonc`. Secreto:

```bash
pnpm wrangler secret put TURNSTILE_SECRET_KEY
```

**Resend (envío):**

1. En Resend → *Domains* → agrega `dylanmontoya.dev` (si el DNS está en Cloudflare, Resend crea los registros automáticamente).
2. *API Keys* → crea una con permiso *Sending access*:

   ```bash
   pnpm wrangler secret put RESEND_API_KEY
   ```

3. `CONTACT_FROM` debe usar ese dominio (ej. `Portafolio <contacto@dylanmontoya.dev>`).
   Al responder el correo, la respuesta va directo al visitante (`reply_to`).

**Correo personalizado que llega a tu Gmail** (Cloudflare Email Routing, gratis):

1. Cloudflare → tu dominio → **Email → Email Routing → Get started**.
2. *Destination addresses* → agrega `dylanmont15@gmail.com` y confirma el correo de verificación que te llega.
3. *Routing rules* → **Create address**: `contacto` → *Send to* `dylanmont15@gmail.com`.
4. Acepta los registros DNS (MX/TXT) que Cloudflare propone. No chocan con los de Resend (Resend usa el subdominio `send.`).

Luego:

- `CONTACT_TO`: `contacto@dylanmontoya.dev` (el reenvío te lo pasa a Gmail), `CONTACT_CC`: vacío.
- Cambia el correo público en *Admin → Perfil* por `contacto@dylanmontoya.dev`.
- Opcional: en Gmail → *Enviar como* puedes responder desde `contacto@` usando el SMTP de Resend.

Sin Email Routing, deja `CONTACT_TO` con tu Gmail (configuración actual).
Además, **cada mensaje se guarda en R2** y se ve en *Admin → Mensajes*, aunque falle el correo.

---

## Editar contenido

Entra a `https://dylanmontoya.dev/admin`:

- **Perfil:** nombre, titular, frase, fecha de nacimiento (eliges mostrar edad, fecha, ambas o nada; la edad se recalcula sola en cada visita), etiquetas, imagen opcional, contacto y texto «Sobre mí».
- **Experiencia / Educación / Proyectos:** crear, editar, eliminar. Fechas `AAAA` o `AAAA-MM`; sin fecha de fin = «Presente».
- **Proyectos:** imagen de portada (botón *Subir imagen*), destacado en inicio, orden manual.
- **Habilidades:** Markdown con grupos `## Grupo` y listas `- elemento`.
- **Archivos y CV:** reemplaza el PDF del CV y sube imágenes para usarlas en Markdown.

Los cambios se ven al instante (hasta ~1 min en otras regiones por la caché en memoria).

## Costos

Todo cabe en los planes gratuitos (Workers, R2, Access, Turnstile, Email Routing, Resend 3 000 correos/mes).
El único costo es la renovación anual del dominio.
