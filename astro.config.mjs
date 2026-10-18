// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: 'https://dylanmontoya.dev',
  // Todo se renderiza en el Worker: el contenido vive en R2 y cambia sin redeploy.
  output: 'server',
  adapter: cloudflare({
    // Las imágenes salen de R2 o de /public; no necesitamos transformaciones.
    imageService: 'passthrough',
  }),
  // No usamos Astro sessions (el acceso admin lo maneja Cloudflare Access).
  session: false,
  // Mantiene los espacios entre elementos inline (Astro 7 usa 'jsx' por defecto).
  compressHTML: true,
  trailingSlash: 'ignore',
  redirects: {
    '/galeria-proyectos': '/proyectos',
    '/formas-contacto': '/contacto',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
