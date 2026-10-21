-- Calendrier de l'espace partenaires : réunions, gestion, chantiers… visibles par tous les utilisateurs de l'admin.
-- Les activités publiques n'y sont pas : elles restent dans src/content/events (le site) et l'admin les lit via /agenda.json.
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  -- reunion · gestion · chantier · autre
  kind TEXT NOT NULL CHECK (kind IN ('reunion', 'gestion', 'chantier', 'autre')),
  date TEXT NOT NULL, -- AAAA-MM-JJ (heure de Bruxelles)
  end_date TEXT, -- dernier jour, pour un événement sur plusieurs jours
  start_time TEXT, -- HH:MM, vide = toute la journée
  end_time TEXT,
  location TEXT,
  visio_url TEXT,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX events_by_date ON events(date);
