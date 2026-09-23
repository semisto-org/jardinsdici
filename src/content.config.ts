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

export const collections = { pages, events, facts, faq, partners, site };
