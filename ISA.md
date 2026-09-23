---
task: "Site Astro des Jardins d'ici avec admin 100 % chatbot"
slug: 20260923-230000_jardinsdici-site
project: JardinsDici
effort: deep
effort_source: auto
phase: execute
progress: 13/30
mode: iterate
started: 2026-09-23T21:00:00Z
updated: 2026-09-23T21:17:00Z
principal_stated_goal: "Ce serait un site internet qui tourne sur Astro et dans lequel on aurait une admin avec des utilisateurs. Et en fait, la question que je me pose, c'est est-ce que cet admin pourrait être uniquement un chatbot?"
principal_stated_goal_source: prompt
principal_stated_goal_signal: 2
principal_stated_goal_locked: 2026-09-23T21:00:00Z
---

## Problem

Le site des Jardins d'ici (www.jardinsdici.org) tourne sur Super (Notion). Pour le mettre à jour, il faut savoir manier Notion et Super, et les membres du collectif — Inès, Simon, les partenaires — ne sont pas techniques. Inès a rédigé une nouvelle arborescence en 13 sections (doc « site web jardins d'ici.pdf ») que la plateforme actuelle rend pénible à appliquer.

## Vision

Un site Astro rapide et chaleureux, hébergé sur Cloudflare, dont l'unique interface d'administration est une conversation. Un membre autorisé ouvre `/admin`, reçoit un code par email, écrit « ajoute la journée de la pomme le 26 septembre avec cette photo », voit un lien d'aperçu apparaître, écrit « publie », et le site est à jour une minute plus tard. Toutes les conversations sont visibles de tous les éditeurs, avec leur statut. Personne ne voit jamais Git, un build ou un conflit.

Surprise euphorique : Inès fait sa première modification seule, sans mode d'emploi, en moins de cinq minutes.

## Out of Scope

- Changer le design ou le code du site via le chat (l'agent ne touche qu'au contenu et aux images).
- Comptes et mots de passe gérés dans l'app (Cloudflare Access s'en charge).
- Bascule DNS de jardinsdici.org avant feu vert explicite de Michael.
- Newsletter (on garde le lien newsletter.semisto.org existant).
- Carte dynamique des plants du jardin-forêt (après la plantation du 15 novembre, projet séparé).

## Principles

- Un fichier par élément de contenu : les conflits deviennent rares par construction.
- Le build Astro est le juge : un contenu invalide ne peut pas atteindre la production.
- Le contenu est du Markdown lisible par un humain, pas une base opaque.

## Constraints

- Astro, bun, TypeScript. Jamais npm/npx.
- Hébergement Cloudflare (Workers Static Assets), compte Cloudflare de Michael.
- Repo GitHub public `semisto-org/jardinsdici` (décision Michael 2026-09-23).
- Admin protégée par Cloudflare Access, liste blanche d'emails ; le Worker vérifie le JWT Access à chaque requête `/admin` et `/api/admin`.
- Mise en ligne en deux temps : aperçu, puis « publie » (décision Michael 2026-09-23).
- Structure des pages : l'arborescence d'Inès en 13 sections (décision Michael 2026-09-23).
- LLM : Claude via clé API Anthropic, avec tool use.

## Dependencies

- Compte Cloudflare (wrangler OAuth OK, scopes workers/d1/pages write — sondé 2026-09-23).
- Clé API Anthropic : compte Anthropic de Semisto, clé dédiée créée par Michael — MISSING tant qu'elle n'est pas posée en secret.
- GitHub : `gh` connecté en `mhulet`, org `supergenial-be` accessible — sondé 2026-09-23.
- Token GitHub pour l'agent (GitHub App ou fine-grained PAT limité au repo) : MISSING, phase admin.
- Emails autorisés à l'admin : m.hulet@semisto.org, ines.riou@student.unamur.be (décision Michael 2026-09-23).

## Goal

Livrer jardinsdici.org en Astro sur Cloudflare, contenu repris du site actuel dans la structure d'Inès, avec une admin `/admin` où des utilisateurs autorisés modifient le site uniquement en conversant avec Claude : branche par conversation, aperçu, publication, statut en direct, conflits résolus sans intervention humaine.

## Criteria

### Site public
- [x] ISC-1: `bun run build` passe sans erreur et sans warning de schéma de contenu.
- [x] ISC-2: Les 13 sections d'Inès existent comme pages ou blocs : accueil, projet & histoire, espaces, école, agenda, infos pratiques & contact, bénévolat, FAQ, ressources, galerie, réseaux sociaux, le saviez-vous, ODD.
- [x] ISC-3: Chaque URL du sitemap actuel (33) renvoie 200 ou une redirection 301 vers son équivalent dans le nouveau site.
- [x] ISC-4: Les 12 événements existants sont des fichiers `src/content/events/*.md` avec une date typée ; l'agenda sépare « à venir » et « passés » selon la date du jour du build.
- [x] ISC-5: Toutes les images sont servies depuis le repo (aucune URL `images.spr.so` ni `unsplash` dans `dist/`).
- [x] ISC-6: L'accueil affiche la présentation, les chiffres clés et les prochains rendez-vous.
- [x] ISC-7: Le site est lisible sans défilement horizontal à 375 px de large (agent-browser, capture mobile).
- [x] ISC-8: Lighthouse performance ≥ 90 sur l'accueil mobile.
- [x] ISC-9: Le site est en ligne sur un domaine Cloudflare (`*.workers.dev` puis domaine final) et chaque page testée s'affiche dans un vrai navigateur.

### Contenu
- [x] ISC-10: Les schémas Zod (`src/content.config.ts`) rejettent un événement sans date ou sans titre (probe : fichier invalide → build échoue).
- [ ] ISC-11: Les textes des pages marquées « garder ce qui est écrit » par Inès sont repris sans perte (comparaison de mots avec l'export).
- [x] ISC-12: Les textes rédigés par Inès (agnelles, école, bénévolat, FAQ, le saviez-vous, ODD, histoire, partenaires) sont intégrés.

### Admin conversationnelle
- [ ] ISC-13: `GET /admin` sans jeton Access renvoie 302 vers Cloudflare Access (ou 403 si appel direct au Worker).
- [ ] ISC-14: Un email hors liste blanche ne peut pas obtenir de session (politique Access lue en retour via API).
- [ ] ISC-15: Le Worker rejette une requête `/api/admin/*` avec un JWT Access invalide ou absent (401).
- [ ] ISC-16: La page `/admin` liste toutes les conversations de tous les utilisateurs avec auteur, date et statut.
- [ ] ISC-17: Une conversation persiste dans D1 et se rouvre avec son historique complet.
- [ ] ISC-18: Démarrer une conversation qui modifie du contenu crée une branche `chat/<id>` et y pousse un commit signé du nom de l'utilisateur.
- [ ] ISC-19: Un lien d'aperçu de la branche s'affiche dans la conversation une fois le build de prévisualisation réussi.
- [ ] ISC-20: « publie » fusionne la branche dans `main` et le statut passe à « en ligne » quand le déploiement de production a réussi.
- [ ] ISC-21: Un build d'aperçu en échec renvoie l'erreur à l'agent, qui corrige et relance sans intervention humaine.
- [ ] ISC-22: Deux conversations modifiant le même fichier publient toutes les deux sans intervention humaine (l'agent réapplique sa modification sur la version à jour).
- [ ] ISC-23: Une photo glissée dans le chat est redimensionnée, ajoutée au repo et utilisable dans la page demandée.
- [ ] ISC-24: L'agent connaît l'histoire du collectif et les partenaires (prompt système versionné dans le repo, `admin/knowledge.md`).
- [ ] ISC-25: Scénario de bout en bout validé dans un vrai navigateur : « ajoute un événement » → aperçu → « publie » → visible en production.

### Anti-claims
- [ ] ISC-26: Anti : l'agent ne peut écrire en dehors de `src/content/**` et `src/assets/**` (outil d'écriture refuse tout autre chemin — probe : test unitaire du garde).
- [ ] ISC-27: Anti : aucun push direct sur `main` par l'agent autrement que par la fusion déclenchée par « publie ».
- [ ] ISC-28: Anti : la clé API Anthropic et le token GitHub n'apparaissent ni dans le repo ni dans le bundle client (grep `dist/` et historique git).
- [x] ISC-29: Anti : aucune page du site public ne charge de script tiers de suivi.
- [x] ISC-30: Anti : le DNS de jardinsdici.org n'est pas modifié sans feu vert de Michael.

## Test Strategy

```yaml
- isc: ISC-1
  tool: bun run build; echo $?
- isc: ISC-3
  tool: script bun qui boucle sur les 33 URL de l'ancien sitemap contre le déploiement (curl -sI, statut 200/301)
- isc: ISC-5
  tool: rg -l "images.spr.so|unsplash" dist/ → vide
- isc: ISC-7
  tool: agent-browser, viewport 375x812, scrollWidth == clientWidth
- isc: ISC-10
  tool: fichier événement sans date dans une copie → bun run build échoue
- isc: ISC-13
  tool: curl -sI https://<host>/admin
- isc: ISC-15
  tool: curl -s -o /dev/null -w "%{http_code}" -H "Cf-Access-Jwt-Assertion: faux" https://<worker>/api/admin/conversations → 401
- isc: ISC-22
  tool: script de test qui ouvre deux conversations sur le même fichier et publie les deux
- isc: ISC-25
  tool: agent-browser, parcours complet filmé
- isc: ISC-26
  tool: bun test admin/tools.test.ts
- isc: ISC-28
  tool: rg -n "sk-ant-|ghp_|github_pat_" -g '!node_modules' . dist/
```

## Features

```yaml
- name: SiteAstro
  description: Structure Inès, collections de contenu, layout, design
  satisfies: [ISC-1, ISC-2, ISC-4, ISC-6, ISC-7, ISC-8, ISC-10]
- name: Migration
  description: Reprise des 33 pages et 89 images depuis Super + textes d'Inès
  satisfies: [ISC-3, ISC-5, ISC-11, ISC-12]
  depends_on: [SiteAstro]
- name: Deploy
  description: Repo GitHub + Worker Cloudflare, build sur push, aperçus par branche
  satisfies: [ISC-9, ISC-19, ISC-20]
  depends_on: [SiteAstro]
- name: AdminChat
  description: Worker /admin, Access, D1, agent Claude avec outils GitHub
  satisfies: [ISC-13..ISC-18, ISC-21..ISC-28]
  depends_on: [Deploy]
```

## Decisions

- 2026-09-23: Admin 100 % chatbot — go (Michael).
- 2026-09-23: Auth par Cloudflare Access (code email) avec liste blanche d'emails — Michael a exigé qu'un inconnu ne puisse pas entrer ; Access n'envoie aucun code aux emails hors politique, et le Worker revérifie le JWT.
- 2026-09-23: Publication en deux temps (aperçu puis « publie ») — Michael.
- 2026-09-23: Arborescence d'Inès en 13 sections — Michael. Constat : le site actuel a déjà intégré une partie des textes d'Inès (mise à jour Super du 2026-09-21).
- 2026-09-23: Le site actuel tourne sur Super (Notion), pas WordPress — contenu extrait par scraping HTML (`.notion-root` → Markdown).
- 2026-09-23: Agent limité au contenu — un agent qui peut toucher au code finira par casser le site ; le design reste un travail de dev.

## Changelog

- 2026-09-23 · conjectured: les dates des événements seraient dans les données de la collection Notion · refuted by: le calendrier Super se charge côté client, aucune date dans le HTML · learned: les dates se lisent dans le texte et sur les affiches (lues visuellement) · criterion now: ISC-4 exige une date typée par fichier, remplie à la main pour les 11 événements.
- 2026-09-23 · conjectured: les images Notion du « Le saviez-vous » se téléchargent depuis le site · refuted by: HTTP 419, les URL signées ont expiré le 2026-09-22 · learned: repli sur les images du PDF d'Inès (basse définition) · criterion now: ISC-5 tenu ; remplacer ces 4 images par de meilleures versions reste ouvert.
- 2026-09-23 · conjectured: `auto-trailing-slash` suffit sur Workers Static Assets · refuted by: /faq et /ressources en 404, autres pages en 307 · learned: `drop-trailing-slash` sert /page directement depuis page/index.html · criterion now: ISC-3 vérifié sur l'URL sans slash final.

## Verification

- ISC-1 : `bun run build` → « 35 page(s) built », aucune ligne warn/error.
- ISC-2 : 13 sections présentes : / , /projet, /espaces (+6 sous-pages), /ecole, /agenda, /infos-pratiques, /benevolat, /faq, /ressources, /galerie, réseaux sociaux (pied de page), /le-saviez-vous, /projet/odd.
- ISC-3 : script de sondage live → « 33/33 anciennes URL aboutissent en 200 » ; curl -I /a-propos → 301 location /projet.
- ISC-4 : 11 fichiers `src/content/events/*.md` avec `date` ; /agenda affiche « À venir » (fête de la pomme 26/09/2026) et « Les éditions précédentes » (agent-browser).
- ISC-5 : `rg images.spr.so|unsplash|file.notion|assets.super.so dist/` → aucun résultat.
- ISC-6 : capture de l'accueil : présentation, chiffres clés (20 / 1400 / 4 / 10), prochains rendez-vous.
- ISC-7 : agent-browser 375 px, scrollWidth = 375 sur 8 pages (après correctif overflow-wrap du dossier pédagogique, qui débordait à 454).
- ISC-8 : Lighthouse mobile en ligne : performance 98, accessibilité 100, bonnes pratiques 100, SEO 100.
- ISC-9 : https://jardinsdici.birch.workers.dev en ligne, pages vues dans agent-browser (accueil, projet, agenda, menu mobile).
- ISC-10 : événement sans date → build exit=1, « InvalidContentEntryDataError … date: Expected type date ».
- ISC-12 : textes d'Inès intégrés (agnelles, école, bénévolat, FAQ, le saviez-vous, ODD, histoire, partenaires).
- ISC-29 : aucun script tiers dans le HTML servi (grep googletagmanager/analytics vide).
- ISC-30 : DNS de jardinsdici.org non modifié (le site Super est toujours servi).
