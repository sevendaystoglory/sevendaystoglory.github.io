-- What a visitor did on a page: outbound links and downloads opened, how far they scrolled,
-- the ASCII effects they used, and copies (length only). One row per event.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pv_id TEXT NOT NULL,          -- the page view (visits.pv_id or visits.last_pv_id) it happened on
  visitor TEXT,                 -- copied from the visit, for "all activity by this visitor"
  ts TEXT NOT NULL,             -- UTC ISO timestamp
  type TEXT NOT NULL,           -- link | download | scroll | click | hold | flux | fx-on | fx-off | copy
  detail TEXT                   -- href, scroll depth, flux level, copied length, ...
);

CREATE INDEX IF NOT EXISTS idx_events_pv_id ON events (pv_id);
CREATE INDEX IF NOT EXISTS idx_events_visitor_ts ON events (visitor, ts);
