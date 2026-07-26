CREATE TABLE product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (name IN ('visited', 'searched', 'saved', 'opened', 'returned')),
  occurred_on TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (session_id, name, occurred_on)
);

CREATE INDEX product_events_date_idx ON product_events (occurred_on);
