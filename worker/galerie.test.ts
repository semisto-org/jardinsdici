import { describe, expect, test } from "bun:test";
import { canEditMedia, cleanMedia, cleanTags, parseRange, sitePath, titleFromName, typeOf } from "./galerie";

describe("fichiers acceptés", () => {
  test("photos et vidéos, d'après l'extension, sans SVG ni HTML", () => {
    expect(typeOf("IMG_2034.JPG")).toEqual({ mime: "image/jpeg", kind: "photo" });
    expect(typeOf("chantier.mov")).toEqual({ mime: "video/quicktime", kind: "video" });
    expect(typeOf("logo.svg")).toBeNull();
    expect(typeOf("page.html")).toBeNull();
    expect(typeOf("photo.heic")).toBeNull();
  });
});

describe("légende et étiquettes", () => {
  test("pas de légende tirée d'un nom d'appareil", () => {
    expect(titleFromName("IMG_2034.jpg")).toBe("");
    expect(titleFromName("DJI_0042.mp4")).toBe("");
    expect(titleFromName("20260921-153012.jpg")).toBe("");
    expect(titleFromName("plantation_haie_octobre.jpg")).toBe("plantation haie octobre");
  });
  test("étiquettes en minuscules, sans doublon ni vide", () => {
    expect(cleanTags("Chantier, potager ,chantier,, ")).toBe("chantier,potager");
    expect(cleanTags(["Fête", "fête des récoltes"])).toBe("fête,fête des récoltes");
    expect(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).split(",")).toHaveLength(12);
  });
  test("date et crédit", () => {
    expect(cleanMedia({ taken_on: "2026-13-01" })).toEqual({ error: "Date invalide." });
    expect(cleanMedia({ taken_on: "", credit: "  " })).toEqual({ taken_on: null, credit: null });
    expect(cleanMedia({ credit: "Simon  Focant" })).toEqual({ credit: "Simon Focant" });
  });
});

describe("droits", () => {
  test("un partenaire ne modifie que ses photos ; éditeurs et administrateurs, toutes", () => {
    const m = { uploaded_by: "simon@exemple.be" };
    expect(canEditMedia({ email: "simon@exemple.be", role: "partenaire" }, m)).toBe(true);
    expect(canEditMedia({ email: "autre@exemple.be", role: "partenaire" }, m)).toBe(false);
    expect(canEditMedia({ email: "ines@exemple.be", role: "editeur" }, m)).toBe(true);
  });
});

describe("galerie du site", () => {
  test("nom de fichier trié par mois de prise de vue, comme les photos existantes", () => {
    expect(sitePath({ id: "a1b2c3d4e5f6", taken_on: "2026-09-21", created_at: 0 })).toBe("src/assets/galerie/2026-09-a1b2c3d4e5f6.jpg");
    expect(sitePath({ id: "a1b2c3d4e5f6", taken_on: null, created_at: Date.UTC(2026, 9, 24) })).toBe("src/assets/galerie/2026-10-a1b2c3d4e5f6.jpg");
  });
});

describe("lecture des vidéos par morceaux", () => {
  test("plages demandées par le navigateur", () => {
    expect(parseRange("bytes=0-", 1000)).toEqual({ offset: 0, length: 1000 });
    expect(parseRange("bytes=100-199", 1000)).toEqual({ offset: 100, length: 100 });
    expect(parseRange("bytes=900-5000", 1000)).toEqual({ offset: 900, length: 100 });
    expect(parseRange("bytes=-200", 1000)).toEqual({ offset: 800, length: 200 });
    expect(parseRange("bytes=2000-", 1000)).toBeNull();
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange("bytes=0-1,5-9", 1000)).toBeNull();
  });
});
