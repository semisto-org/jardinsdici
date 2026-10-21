// Agenda public en JSON, lu par l'admin pour afficher les activités publiques dans son calendrier.
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export const GET: APIRoute = async () => {
  const events = (await getCollection("events"))
    .sort((a, b) => +a.data.date - +b.data.date)
    .map((e) => ({
      id: e.id,
      title: e.data.title,
      date: iso(e.data.date),
      endDate: e.data.endDate ? iso(e.data.endDate) : null,
      time: e.data.time ?? null,
      summary: e.data.summary ?? null,
      url: `/agenda/${e.id}`,
    }));
  return new Response(JSON.stringify({ events }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
