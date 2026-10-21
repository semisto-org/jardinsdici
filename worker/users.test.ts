import { describe, expect, test } from "bun:test";
import { can, checkChange, cleanInput, type User } from "./users";
import type { Env } from "./env";

const env = { ADMIN_EMAILS: "owner@ex.org" } as Env;
const u = (email: string, role: User["role"], active = 1): User => ({ email, name: email, organisation: null, role, active, created_at: 0, created_by: null, last_seen_at: null });

describe("droits", () => {
  test("seuls les administrateurs gèrent les utilisateurs, les partenaires ne modifient pas le site", () => {
    expect(can(u("a", "admin"), "users")).toBe(true);
    expect(can(u("e", "editeur"), "users")).toBe(false);
    expect(can(u("e", "editeur"), "site")).toBe(true);
    expect(can(u("p", "partenaire"), "site")).toBe(false);
  });
});

describe("saisie", () => {
  test("normalise l'adresse et refuse les champs invalides", () => {
    expect(cleanInput({ email: " Jo@Ex.org ", name: "Jo", role: "partenaire" }, true)).toEqual({ email: "jo@ex.org", name: "Jo", role: "partenaire" });
    expect(cleanInput({ email: "pas-une-adresse", name: "Jo", role: "partenaire" }, true)).toHaveProperty("error");
    expect(cleanInput({ email: "jo@ex.org", name: " ", role: "partenaire" }, true)).toHaveProperty("error");
    expect(cleanInput({ role: "superadmin" }, false)).toHaveProperty("error");
    expect(cleanInput({ organisation: "  " }, false)).toEqual({ organisation: null });
  });
});

describe("garde-fous", () => {
  const me = u("me@ex.org", "admin"), other = u("b@ex.org", "admin"), owner = u("owner@ex.org", "admin");
  test("on ne se retire pas ses propres droits", () => {
    expect(checkChange(env, me, me, { role: "editeur" }, [me, other])).toBeString();
    expect(checkChange(env, me, me, { active: 0 }, [me, other])).toBeString();
  });
  test("le propriétaire reste administrateur", () => {
    expect(checkChange(env, me, owner, { active: 0 }, [me, owner])).toBeString();
  });
  test("il reste toujours un administrateur actif", () => {
    expect(checkChange(env, me, other, { role: "partenaire" }, [me, other])).toBeNull();
    expect(checkChange(env, me, other, { role: "partenaire" }, [u("me@ex.org", "admin", 0), other])).toBeString();
  });
  test("changer un non-administrateur est libre", () => {
    expect(checkChange(env, me, u("p@ex.org", "partenaire"), { active: 0 }, [me])).toBeNull();
  });
});
