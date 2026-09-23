-- Conversations de l'admin : visibles par tous les éditeurs.
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  -- ouverte : en cours · apercu : modifications prêtes à voir · publiee : en ligne · abandonnee
  status TEXT NOT NULL DEFAULT 'ouverte',
  branch TEXT,
  preview_url TEXT,
  published_sha TEXT,
  busy INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Messages au format exact de l'API Anthropic (blocs de contenu JSON), pour rejouer l'historique à l'identique.
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  author TEXT,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_by_conversation ON messages(conversation_id, id);
