-- events.performers: JSON array of people the event is about or by — authors at a
-- book talk, artists on a bill, speakers on a panel. Filled by Gold from the
-- source's `authors` / `performers` / `artists` / `speakers` keys; '[]' when the
-- source does not say. Read like event_type (JSON text).
ALTER TABLE events ADD COLUMN performers TEXT NOT NULL DEFAULT '[]';
