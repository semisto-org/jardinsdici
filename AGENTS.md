# Aux Jardins d'ici — site web

Site vitrine Astro des Jardins d'ici (Naninne), hébergé sur Cloudflare. Deux Workers : `jardinsdici` (site public, fichiers statiques seulement, `wrangler.jsonc`) et `jardinsdici-admin` (admin conversationnelle, `wrangler.admin.jsonc`, sur son propre domaine `admin.jardinsdici.org`, protégé par Cloudflare Access). Remplace l'ancien site Super/Notion (www.jardinsdici.org). Réalisation Super Génial. Doctrine et critères : `ISA.md`.

## Commandes

- `bun run dev` — serveur local (port 4321)
- `bun run build` — build statique dans `dist/` ; échoue si un contenu ne respecte pas les schémas
- `bunx wrangler deploy` — publie `dist/` (site public)
- `bunx wrangler dev -c wrangler.admin.jsonc --local-upstream localhost:8787` — admin en local (identité de dev via `DEV_AUTH_EMAIL` dans `.dev.vars` ; `--local-upstream` garde `localhost` comme hôte, sinon wrangler prend celui de la route et l'identité de dev est refusée). Base locale : `bunx wrangler d1 migrations apply jardinsdici-admin --local -c wrangler.admin.jsonc`
- `bun test worker/` — tests des garde-fous de l'agent
- Mise en ligne normale : push sur `main` → GitHub Actions construit et déploie les deux Workers ; push sur `chat/*` → aperçu `https://chat-<id>-jardinsdici.semisto.workers.dev`

## Où vit le contenu

Tout le contenu éditorial est en Markdown dans `src/content/`, un fichier par élément ; les schémas sont dans `src/content.config.ts`.

- `pages/**.md` — pages ; l'arborescence des fichiers = l'URL (`pages/espaces/potager-en-permaculture.md` → `/espaces/potager-en-permaculture`). Une page liste automatiquement ses sous-pages.
- `events/AAAA-MM-JJ-slug.md` — agenda ; `date` obligatoire, « à venir » / « passés » calculés au build.
- `facts/`, `faq/`, `partners/` — Le saviez-vous, FAQ, partenaires.
- `site.yaml` — chiffres clés de l'accueil, contact, liens (newsletter, Facebook, réservation école).
- `textes.yaml` — tous les autres textes visibles (titres et boutons de l'accueil, menu, pied de page, en-têtes des pages de liste, libellés). Aucun texte visible ne doit être codé en dur dans un gabarit : tout nouveau texte va dans ce fichier et dans son schéma (`src/content.config.ts`). Seule exception volontaire : la mention « Site réalisé par Super Génial ».
- Images : `src/assets/images/` (référencées en chemin relatif depuis le Markdown) ; galerie : tout fichier déposé dans `src/assets/galerie/` apparaît sur `/galerie`.

## Admin conversationnelle

`worker/` : l'éditeur converse avec un agent Claude (`worker/agent.ts`) qui travaille sur la branche `chat/<id>` de la conversation ; l'agent tourne dans un Durable Object par conversation (`worker/runner.ts`, alarme), l'historique est dans D1 (`jardinsdici-admin`). Publier = fusion dans `main` après un aperçu construit avec succès (`worker/publish.ts`). Ce que l'agent sait du collectif : `admin/knowledge.md` (public, pas de données personnelles).

Utilisateurs et droits : table D1 `users` (`worker/users.ts`), gérée depuis l'écran « Utilisateurs ». Rôles : `admin` (gère les utilisateurs), `editeur` (modifie le site), `partenaire` (espace partenaires). `ADMIN_EMAILS` = propriétaires, toujours administrateurs. Access ne fait que vérifier l'identité ; `worker/access.ts` tient le groupe Access à jour depuis la table (si `CF_API_TOKEN`, `CF_ACCOUNT_ID` et `ACCESS_GROUP_ID` sont configurés).

Calendrier : événements internes (réunions, gestion, chantiers) dans la table D1 `events` (`worker/calendar.ts`), modifiables par leur auteur, les éditeurs et les administrateurs. Les activités publiques restent dans `src/content/events/` ; l'admin les lit sur le site via `/agenda.json` (`src/pages/agenda.json.ts`) et passe par l'assistant pour en publier une.

Documents : fichiers dans le bucket R2 privé `jardinsdici-docs-eu` (juridiction UE) (binding `FILES`), fiches dans la table D1 `documents` (`worker/documents.ts`) ; le texte des .docx est extrait (`worker/docx.ts`) pour la recherche. Servis uniquement à travers l'admin, jamais en HTML ni SVG.

## Règles

- bun uniquement, jamais npm/npx.
- Les anciennes URL Super sont redirigées en 301 dans `public/_redirects` ; ne jamais en supprimer.
- Aucun script tiers de suivi sur le site public.
- Le design (layouts, composants, CSS) ne se modifie pas depuis l'admin conversationnelle : l'agent ne touche qu'à `src/content/**` et `src/assets/**`.
