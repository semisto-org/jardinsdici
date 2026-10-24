-- Photothèque de l'espace partenaires : photos et vidéos utiles à la communication. Fichiers dans R2 (binding FILES), fiches ici.
-- Une photo n'est sur le site public que si un éditeur l'y a mise (copie dans src/assets/galerie, publiée comme une conversation).
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  name TEXT NOT NULL, -- nom du fichier tel qu'il a été envoyé
  title TEXT NOT NULL, -- légende, modifiable
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  thumb_key TEXT, -- vignette JPEG faite par le navigateur au dépôt
  width INTEGER,
  height INTEGER,
  taken_on TEXT, -- AAAA-MM-JJ : date de la prise de vue
  credit TEXT, -- auteur ou autrice de la photo
  tags TEXT NOT NULL DEFAULT '', -- étiquettes en minuscules, séparées par des virgules
  site_path TEXT, -- src/assets/galerie/… une fois proposée pour le site
  site_conv TEXT, -- conversation qui la met en ligne (aperçu puis publication)
  uploaded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX media_by_date ON media(taken_on, created_at);
