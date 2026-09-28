// Schémas du contenu. Le build échoue si un fichier ne les respecte pas :
// c'est le garde-fou qui empêche un contenu invalide d'atteindre la production.
import { defineCollection } from "astro:content";
import { glob, file } from "astro/loaders";
import { z } from "astro/zod";

// URL http(s) uniquement : z.string().url() seul accepterait javascript:…
const httpUrl = () => z.string().url().refine((u) => /^https?:\/\//.test(u), "URL http(s) attendue");
const siteHref = () => z.string().refine((u) => /^(\/|https?:\/\/|#)/.test(u), "Lien interne (/…) ou URL http(s) attendu");

const pages = defineCollection({
  loader: glob({ base: "./src/content/pages", pattern: "**/*.md" }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      cover: image().optional(),
      order: z.number().default(99),
    }),
});

const events = defineCollection({
  loader: glob({ base: "./src/content/events", pattern: "*.md" }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      date: z.coerce.date(),
      endDate: z.coerce.date().optional(),
      time: z.string().optional(),
      summary: z.string().optional(),
      cover: image().optional(),
      link: httpUrl().optional(),
    }),
});

const facts = defineCollection({
  loader: glob({ base: "./src/content/facts", pattern: "*.md" }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      image: image().optional(),
      source: z.object({ label: z.string(), url: httpUrl() }).optional(),
      order: z.number().default(99),
    }),
});

const faq = defineCollection({
  loader: glob({ base: "./src/content/faq", pattern: "*.md" }),
  schema: z.object({ question: z.string().min(1), order: z.number().default(99) }),
});

const partners = defineCollection({
  loader: glob({ base: "./src/content/partners", pattern: "*.md" }),
  schema: ({ image }) =>
    z.object({
      name: z.string().min(1),
      role: z.string().min(1),
      url: httpUrl().optional(),
      image: image().optional(),
      order: z.number().default(99),
    }),
});

const site = defineCollection({
  loader: file("src/content/site.yaml"),
  schema: z.object({
    tagline: z.string(),
    intro: z.array(z.string()),
    stats: z.array(z.object({ value: z.string(), label: z.string(), href: siteHref().optional() })),
    email: z.string().email(),
    address: z.string(),
    mapsUrl: httpUrl(),
    newsletterUrl: httpUrl(),
    facebookUrl: httpUrl(),
    photosUrl: httpUrl(),
    schoolBookingUrl: httpUrl(),
  }),
});

// Tous les textes fixes du site (textes.yaml) : aucun texte visible ne reste codé en dur dans les gabarits.
const txt = () => z.string().min(1);
const lien = () => z.object({ label: txt(), href: siteHref() });
const textes = defineCollection({
  loader: file("src/content/textes.yaml"),
  schema: z.object({
    menu: z.object({ marque: txt(), aller_au_contenu: txt(), ouvrir: txt(), fermer: txt(), liens: z.array(lien()).min(1) }),
    accueil: z.object({
      titre_onglet: txt(), surtitre: z.string(), titre: txt(),
      bouton_principal: lien(), bouton_secondaire: lien(),
      photo_description: txt(), photo_legende: z.string(),
      chiffres_titre: txt(), rendezvous_titre: txt(), rendezvous_titre_sans_date: txt(), rendezvous_lien: txt(),
      espaces_titre: txt(), espaces_lien: txt(), saviez_vous_lien: txt(),
      appels: z.array(z.object({ surtitre: z.string(), titre: txt(), texte: z.string(), href: siteHref() })),
    }),
    pied_de_page: z.object({
      accroche: z.string(), newsletter: txt(), facebook: txt(), trouver_titre: txt(), itineraire: txt(), acces: txt(),
      explorer_titre: txt(), liens: z.array(lien()), partenaires: z.string(),
    }),
    pages: z.object({ fil_ariane_accueil: txt(), aller_plus_loin: txt(), decouvrir: txt(), partenaires_titre: txt(), partenaires_intro: z.string(), partenaire_role: txt() }),
    agenda: z.object({ titre_onglet: txt(), surtitre: z.string(), titre: txt(), description: z.string(), a_venir: txt(), aucun: txt(), passes: txt(), plus_infos: txt(), retour: txt() }),
    faq: z.object({ surtitre: z.string(), titre: txt(), description: z.string(), pas_trouve: z.string(), ecrivez_nous: txt() }),
    saviez_vous: z.object({ surtitre: z.string(), titre: txt(), description: z.string(), etiquette: txt(), source: txt() }),
    galerie: z.object({ surtitre: z.string(), titre: txt(), description: z.string(), photo_description: txt(), album: txt() }),
    page_introuvable: z.object({ surtitre: z.string(), titre: txt(), description: z.string(), retour: txt() }),
  }),
});

export const collections = { pages, events, facts, faq, partners, site, textes };
