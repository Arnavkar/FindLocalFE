-- Recurring-rule lifecycle: evidence, verification state, check log, user reports.
--
-- Rules are researched, not scraped, so nothing re-checks them once inserted.
-- This migration gives every rule (a) an evidence page separate from the
-- public link, (b) a rolling verification schedule with a cached status, and
-- (c) two append-only tables: one for automated/agent checks, one for
-- user-submitted reports from the public site. The materializer, the daily
-- verify webhook and the admin UI read/write these columns.

-- ---------------------------------------------------------------- recurring_events
ALTER TABLE recurring_events ADD COLUMN evidence_url TEXT;
-- first_party | league | directory | user | curated
ALTER TABLE recurring_events ADD COLUMN evidence_kind TEXT;
-- Normalized visible-text snippet from the evidence page that states day+time.
ALTER TABLE recurring_events ADD COLUMN evidence_snippet TEXT;
-- verified | unverified | changed | gone | expired | review
ALTER TABLE recurring_events ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'
  CHECK (verification_status IN ('verified','unverified','changed','gone','expired','review'));
ALTER TABLE recurring_events ADD COLUMN next_check_at TEXT;
ALTER TABLE recurring_events ADD COLUMN last_check_at TEXT;
ALTER TABLE recurring_events ADD COLUMN last_check_outcome TEXT;
ALTER TABLE recurring_events ADD COLUMN consecutive_failed_checks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recurring_events ADD COLUMN needs_manual_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recurring_events ADD COLUMN review_note TEXT;
ALTER TABLE recurring_events ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0;
-- JSON array of 'YYYY-MM-DD' dates the rule does not run (holiday closures etc.).
ALTER TABLE recurring_events ADD COLUMN skip_dates TEXT NOT NULL DEFAULT '[]';

CREATE INDEX idx_recurring_next_check ON recurring_events(is_active, next_check_at);
CREATE INDEX idx_recurring_review     ON recurring_events(needs_manual_review, city);

-- ---------------------------------------------------------------- check log
CREATE TABLE recurring_rule_checks (
  id             INTEGER PRIMARY KEY,
  rule_id        TEXT NOT NULL,
  city           TEXT NOT NULL,
  checked_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  evidence_url   TEXT,
  -- confirmed | changed | gone | blocked | unreachable | no_evidence | error
  outcome        TEXT NOT NULL,
  http_status    INTEGER,
  snippet_found  INTEGER,
  -- still_true | new_schedule | discontinued | unsure (only when the LLM ran)
  llm_verdict    TEXT,
  llm_reason     TEXT,
  llm_proposed   TEXT,
  duration_ms    INTEGER,
  -- scheduled | report | manual | backfill
  triggered_by   TEXT NOT NULL DEFAULT 'scheduled',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_rule_checks_rule    ON recurring_rule_checks(rule_id, checked_at DESC);
CREATE INDEX idx_rule_checks_created ON recurring_rule_checks(created_at);

-- ---------------------------------------------------------------- user reports
CREATE TABLE event_reports (
  id             INTEGER PRIMARY KEY,
  event_id       TEXT,
  rule_id        TEXT,
  venue_id       TEXT,
  city           TEXT,
  -- no_longer_happening | wrong_day_time | wrong_price | venue_closed | other
  reason         TEXT NOT NULL,
  details        TEXT,
  reporter_hash  TEXT,
  user_agent     TEXT,
  -- new | triaged | resolved | dismissed
  status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','resolved','dismissed')),
  resolution     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at    TEXT
);
CREATE INDEX idx_reports_rule   ON event_reports(rule_id, created_at DESC);
CREATE INDEX idx_reports_status ON event_reports(status, created_at DESC);
CREATE INDEX idx_reports_event  ON event_reports(event_id);

-- ---------------------------------------------------------------- backfill
-- The public link doubled as the evidence page until now.
UPDATE recurring_events SET evidence_url = url WHERE evidence_url IS NULL AND url IS NOT NULL;

UPDATE recurring_events SET evidence_kind = CASE
  WHEN evidence_url IS NULL THEN NULL
  WHEN valid_until IS NULL THEN 'curated'
  WHEN evidence_url LIKE '%geekswhodrink.com%' OR evidence_url LIKE '%kingtrivia.com%'
    OR evidence_url LIKE '%triviamafia.com%' OR evidence_url LIKE '%sporcle.com%'
    OR evidence_url LIKE '%challengeentertainment.com%' OR evidence_url LIKE '%showtimetrivia.com%'
    OR evidence_url LIKE '%nyctrivialeague.com%' OR evidence_url LIKE '%johnnygoodtimes.com%'
    OR evidence_url LIKE '%teamtrivia.com%' OR evidence_url LIKE '%trivialogy.com%'
    OR evidence_url LIKE '%lastcalltrivia.com%' OR evidence_url LIKE '%districttrivia.com%'
    OR evidence_url LIKE '%notrocketsciencetrivia.com%' OR evidence_url LIKE '%big5trivia.com%'
    OR evidence_url LIKE '%stumptrivia.com%' OR evidence_url LIKE '%quizzo%'
    THEN 'league'
  WHEN evidence_url LIKE '%badslava.com%' OR evidence_url LIKE '%trivianearme%'
    OR evidence_url LIKE '%openmic%' OR evidence_url LIKE '%yelp.com%' OR evidence_url LIKE '%facebook.com%'
    OR evidence_url LIKE '%instagram.com%'
    THEN 'directory'
  ELSE 'first_party'
END WHERE evidence_kind IS NULL;

-- Rules with no evidence page cannot be checked automatically: queue them for a human.
UPDATE recurring_events
   SET needs_manual_review = 1, verification_status = 'review',
       review_note = 'no evidence URL on record'
 WHERE is_active = 1 AND evidence_url IS NULL;

-- Spread the first automated check over the next 60 days, soonest-expiring
-- rules first, so the November expiry cliff becomes a trickle.
UPDATE recurring_events
   SET next_check_at = (
     SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ((r2.rn * 60) / r2.total) || ' days')
       FROM (SELECT id,
                    ROW_NUMBER() OVER (ORDER BY (valid_until IS NULL), valid_until, id) AS rn,
                    COUNT(*) OVER () AS total
               FROM recurring_events
              WHERE is_active = 1 AND evidence_url IS NOT NULL) r2
      WHERE r2.id = recurring_events.id)
 WHERE is_active = 1 AND evidence_url IS NOT NULL;
