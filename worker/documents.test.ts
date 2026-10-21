import { describe, expect, test } from "bun:test";
import { canEditDoc, cleanDoc, dateFromName, disposition, mimeOf, titleFromName } from "./documents";
import { docxText } from "./docx";

describe("fichiers acceptés", () => {
  test("d'après l'extension, sans HTML ni SVG (qui pourraient exécuter du code dans l'admin)", () => {
    expect(mimeOf("PV.DOCX")).toContain("wordprocessingml");
    expect(mimeOf("plan.pdf")).toBe("application/pdf");
    expect(mimeOf("page.html")).toBeNull();
    expect(mimeOf("logo.svg")).toBeNull();
    expect(mimeOf("sans-extension")).toBeNull();
  });
});

describe("titre et date déduits du nom", () => {
  test("formats des PV existants", () => {
    expect(dateFromName("réunion transversale 27-04-26.docx")).toBe("2026-04-27");
    expect(dateFromName("réunion 2.7.26.docx")).toBe("2026-07-02");
    expect(dateFromName("Note prépa réunion 21-09-26 1.docx")).toBe("2026-09-21");
    expect(dateFromName("plan-2026-03-15.pdf")).toBe("2026-03-15");
    expect(dateFromName("CR réunion 25.08.docx")).toBeNull();
    expect(dateFromName("photo 45-13-26.jpg")).toBeNull();
    expect(titleFromName("CR_réunion_25.08.docx")).toBe("CR réunion 25.08");
  });
});

describe("saisie et droits", () => {
  test("refuse un titre vide ou une date invalide", () => {
    expect(cleanDoc({ title: " " })).toHaveProperty("error");
    expect(cleanDoc({ doc_date: "27/04/2026" })).toHaveProperty("error");
    expect(cleanDoc({ folder: "  PV   de réunions ", doc_date: "" })).toEqual({ folder: "PV de réunions", doc_date: null });
  });
  test("un partenaire ne modifie que ses propres documents", () => {
    expect(canEditDoc({ email: "a@ex.org", role: "partenaire" }, { uploaded_by: "a@ex.org" })).toBe(true);
    expect(canEditDoc({ email: "b@ex.org", role: "partenaire" }, { uploaded_by: "a@ex.org" })).toBe(false);
    expect(canEditDoc({ email: "c@ex.org", role: "editeur" }, { uploaded_by: "a@ex.org" })).toBe(true);
  });
  test("nom de fichier accentué dans l'en-tête de téléchargement", () => {
    expect(disposition(false, "réunion 2.7.26.docx")).toBe(`attachment; filename="reunion 2.7.26.docx"; filename*=UTF-8''r%C3%A9union%202.7.26.docx`);
  });
});

test("texte d'un document Word, pour la recherche", async () => {
  const text = await docxText(new Uint8Array(await Bun.file(new URL("./fixtures/exemple.docx", import.meta.url)).arrayBuffer()));
  expect(text).toBe("Coordination transversale – 4 août 2026\nParticipants : Simon, Flore & Judith\nPlantation du 15 novembre\tdemi-journée");
  expect(await docxText(new Uint8Array([1, 2, 3]))).toBeNull();
});
