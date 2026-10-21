import { describe, expect, test } from "bun:test";
import { canEdit, cleanEvent, type CalEvent } from "./calendar";

const base = { title: "Coordination transversale", kind: "reunion", date: "2026-11-16" };

describe("saisie d'un événement", () => {
  test("accepte un événement complet et nettoie les champs vides", () => {
    expect(cleanEvent({ ...base, start_time: "16:30", end_time: "17:30", location: " ", visio_url: "https://zoom.us/j/123" }, true)).toEqual({
      ...base, end_date: null, start_time: "16:30", end_time: "17:30", location: null, visio_url: "https://zoom.us/j/123", description: null,
    });
  });
  test("refuse les saisies incohérentes", () => {
    expect(cleanEvent({ ...base, title: " " }, true)).toHaveProperty("error");
    expect(cleanEvent({ ...base, kind: "fete" }, true)).toHaveProperty("error");
    expect(cleanEvent({ ...base, date: "2026-13-01" }, true)).toHaveProperty("error");
    expect(cleanEvent({ ...base, end_date: "2026-11-15" }, true)).toHaveProperty("error");
    expect(cleanEvent({ ...base, start_time: "17:30", end_time: "16:30" }, true)).toHaveProperty("error");
    expect(cleanEvent({ ...base, end_time: "16:30" }, true)).toHaveProperty("error");
    expect(cleanEvent({ ...base, visio_url: "javascript:alert(1)" }, true)).toHaveProperty("error");
  });
  test("une fin le même jour n'est pas un événement sur plusieurs jours", () => {
    expect(cleanEvent({ ...base, end_date: "2026-11-16" }, true)).toHaveProperty("end_date", null);
  });
  test("une modification partielle est vérifiée avec les valeurs déjà enregistrées", () => {
    const current = { ...base, start_time: "16:30", end_time: "17:30", end_date: null } as CalEvent;
    expect(cleanEvent({ start_time: "18:00" }, false, current)).toHaveProperty("error");
    expect(cleanEvent({ title: "Réunion panneaux" }, false, current)).toEqual({ title: "Réunion panneaux" });
  });
});

describe("droits", () => {
  test("un partenaire ne modifie que ses propres événements, un éditeur tous", () => {
    const ev = { created_by: "simon@ex.org" };
    expect(canEdit({ email: "simon@ex.org", role: "partenaire" }, ev)).toBe(true);
    expect(canEdit({ email: "frank@ex.org", role: "partenaire" }, ev)).toBe(false);
    expect(canEdit({ email: "ines@ex.org", role: "editeur" }, ev)).toBe(true);
  });
});
