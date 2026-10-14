-- Utilisateurs de l'admin : la liste de référence de qui peut entrer et de ce que chacun peut faire.
-- Le groupe Cloudflare Access est synchronisé depuis cette table (worker/access.ts).
CREATE TABLE users (
  email TEXT PRIMARY KEY, -- toujours en minuscules
  name TEXT NOT NULL,
  organisation TEXT,
  -- admin : gère les utilisateurs et tout le reste · editeur : modifie le site · partenaire : espace partenaires
  role TEXT NOT NULL CHECK (role IN ('admin', 'editeur', 'partenaire')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  created_by TEXT,
  last_seen_at INTEGER
);

-- Les deux éditeurs d'avant la gestion des utilisateurs.
INSERT INTO users (email, name, organisation, role, created_at) VALUES
  ('m.hulet@semisto.org', 'Michael Hulet', 'Semisto', 'admin', unixepoch() * 1000),
  ('ines.riou@student.unamur.be', 'Inès Riou', NULL, 'editeur', unixepoch() * 1000);
