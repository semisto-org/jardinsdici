# Aux Jardins d'ici — site web

Site vitrine Astro des Jardins d'ici (Naninne), hébergé sur Cloudflare. Deux Workers : `jardinsdici` (site public, fichiers statiques seulement, `wrangler.jsonc`) et `jardinsdici-admin` (admin conversationnelle, `wrangler.admin.jsonc`, sur son propre domaine protégé par Cloudflare Access). Remplace l'ancien site Super/Notion (www.jardinsdici.org). Réalisation Super Génial. Doctrine et critères : `ISA.md`.

## Commandes

- `bun run dev` — serveur local (port 4321)
- `bun run build` — build statique dans `dist/` ; échoue si un contenu ne respecte pas les schémas
- `bunx wrangler deploy` — publie `dist/` (site public)
- `bunx wrangler dev -c wrangler.admin.jsonc` — admin en local (identité de dev via `DEV_AUTH_EMAIL` dans `.dev.vars`)
- `bun test worker/` — tests des garde-fous de l'agent
- Mise en ligne normale : push sur `main` → GitHub Actions construit et déploie les deux Workers ; push sur `chat/*` → aperçu `https://chat-<id>-jardinsdici.birch.workers.dev`

## Où vit le contenu

Tout le contenu éditorial est en Markdown dans `src/content/`, un fichier par élément ; les schémas sont dans `src/content.config.ts`.

- `pages/**.md` — pages ; l'arborescence des fichiers = l'URL (`pages/espaces/potager-en-permaculture.md` → `/espaces/potager-en-permaculture`). Une page liste automatiquement ses sous-pages.
- `events/AAAA-MM-JJ-slug.md` — agenda ; `date` obligatoire, « à venir » / « passés » calculés au build.
- `facts/`, `faq/`, `partners/` — Le saviez-vous, FAQ, partenaires.
- `site.yaml` — chiffres clés de l'accueil, contact, liens (newsletter, Facebook, réservation école).
- Images : `src/assets/images/` (référencées en chemin relatif depuis le Markdown) ; galerie : tout fichier déposé dans `src/assets/galerie/` apparaît sur `/galerie`.

## Admin conversationnelle

`worker/` : l'éditeur converse avec un agent Claude (`worker/agent.ts`) qui travaille sur la branche `chat/<id>` de la conversation ; l'agent tourne dans un Durable Object par conversation (`worker/runner.ts`, alarme), l'historique est dans D1 (`jardinsdici-admin`). Publier = fusion dans `main` après un aperçu construit avec succès (`worker/publish.ts`). Ce que l'agent sait du collectif : `admin/knowledge.md` (public, pas de données personnelles).

## Règles

- bun uniquement, jamais npm/npx.
- Les anciennes URL Super sont redirigées en 301 dans `public/_redirects` ; ne jamais en supprimer.
- Aucun script tiers de suivi sur le site public.
- Le design (layouts, composants, CSS) ne se modifie pas depuis l'admin conversationnelle : l'agent ne touche qu'à `src/content/**` et `src/assets/**`.
