# Aux Jardins d'ici — site web

Site vitrine Astro des Jardins d'ici (Naninne), hébergé sur Cloudflare (Workers Static Assets). Remplace l'ancien site Super/Notion (www.jardinsdici.org). Réalisation Super Génial. Doctrine et critères : `ISA.md`.

## Commandes

- `bun run dev` — serveur local (port 4321)
- `bun run build` — build statique dans `dist/` ; échoue si un contenu ne respecte pas les schémas
- `bunx wrangler deploy` — publie `dist/` sur Cloudflare

## Où vit le contenu

Tout le contenu éditorial est en Markdown dans `src/content/`, un fichier par élément ; les schémas sont dans `src/content.config.ts`.

- `pages/**.md` — pages ; l'arborescence des fichiers = l'URL (`pages/espaces/potager-en-permaculture.md` → `/espaces/potager-en-permaculture`). Une page liste automatiquement ses sous-pages.
- `events/AAAA-MM-JJ-slug.md` — agenda ; `date` obligatoire, « à venir » / « passés » calculés au build.
- `facts/`, `faq/`, `partners/` — Le saviez-vous, FAQ, partenaires.
- `site.yaml` — chiffres clés de l'accueil, contact, liens (newsletter, Facebook, réservation école).
- Images : `src/assets/images/` (référencées en chemin relatif depuis le Markdown) ; galerie : tout fichier déposé dans `src/assets/galerie/` apparaît sur `/galerie`.

## Règles

- bun uniquement, jamais npm/npx.
- Les anciennes URL Super sont redirigées en 301 dans `public/_redirects` ; ne jamais en supprimer.
- Aucun script tiers de suivi sur le site public.
- Le design (layouts, composants, CSS) ne se modifie pas depuis l'admin conversationnelle : l'agent ne touche qu'à `src/content/**` et `src/assets/**`.
