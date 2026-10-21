-- Documents partagés de l'espace partenaires (PV, PDF, plans…). Le fichier est dans R2 (binding FILES), sa fiche ici.
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  folder TEXT NOT NULL, -- dossier libre : « PV de réunions », « Plans »…
  name TEXT NOT NULL, -- nom du fichier tel qu'il a été envoyé
  title TEXT NOT NULL, -- titre affiché, modifiable
  doc_date TEXT, -- AAAA-MM-JJ : date du document (réunion, plan…), facultative
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  text TEXT, -- texte extrait (Word, texte) pour la recherche
  uploaded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX documents_by_folder ON documents(folder, doc_date);
