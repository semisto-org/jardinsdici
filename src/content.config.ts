// Schémas du contenu. Le build échoue si un fichier ne les respecte pas :
// c'est le garde-fou qui empêche un contenu invalide d'atteindre la production.
import { defineCollection } from "astro:content";
import { glob, file } from "astro/loaders";
import { z } from "astro/zod";

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
      link: z.string().url().optional(),
    }),
});

const facts = defineCollection({
  loader: glob({ base: "./src/content/facts", pattern: "*.md" }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      image: image().optional(),
      source: z.object({ label: z.string(), url: z.string().url() }).optional(),
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
      url: z.string().url().optional(),
      image: image().optional(),
      order: z.number().default(99),
    }),
});

const site = defineCollection({
  loader: file("src/content/site.yaml"),
  schema: z.object({
    tagline: z.string(),
    intro: z.array(z.string()),
    stats: z.array(z.object({ value: z.string(), label: z.string(), href: z.string().optional() })),
    email: z.string().email(),
    address: z.string(),
    mapsUrl: z.string().url(),
    newsletterUrl: z.string().url(),
    facebookUrl: z.string().url(),
    photosUrl: z.string().url(),
    schoolBookingUrl: z.string().url(),
  }),
});

export const collections = { pages, events, facts, faq, partners, site };
