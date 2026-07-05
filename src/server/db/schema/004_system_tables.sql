-- System/audit tables backing the import engine, archive, and ID generation.

CREATE TABLE IF NOT EXISTS import_batches (
  batch_id            TEXT PRIMARY KEY,
  trip_folder_name    TEXT NOT NULL,
  import_started_at   TEXT NOT NULL,
  import_completed_at TEXT,
  status              TEXT NOT NULL DEFAULT 'validating' CHECK (status IN ('validating', 'committed', 'failed', 'rolled_back')),
  imported_by_user_id TEXT REFERENCES users(user_id),
  total_files         INTEGER NOT NULL DEFAULT 0,
  checksum_manifest_json TEXT
);

CREATE TABLE IF NOT EXISTS import_errors (
  error_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id        TEXT NOT NULL REFERENCES import_batches(batch_id),
  file_name       TEXT NOT NULL,
  sheet_name      TEXT,
  cell_reference  TEXT,
  error_type      TEXT NOT NULL,
  error_message   TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('warning', 'error'))
);
CREATE INDEX IF NOT EXISTS idx_import_errors_batch ON import_errors(batch_id);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type         TEXT NOT NULL,
  entity_id           TEXT NOT NULL,
  action              TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'import', 'export')),
  changed_by_user_id  TEXT REFERENCES users(user_id),
  changed_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  old_value_json      TEXT,
  new_value_json      TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS archive_manifest (
  archive_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id           TEXT NOT NULL REFERENCES import_batches(batch_id),
  trip_id            TEXT REFERENCES trips(trip_id),
  original_file_name TEXT NOT NULL,
  archive_path       TEXT NOT NULL,
  checksum_sha256    TEXT NOT NULL,
  archived_at        TEXT NOT NULL,
  is_locked          INTEGER NOT NULL DEFAULT 1 CHECK (is_locked IN (0, 1))
);

CREATE TABLE IF NOT EXISTS app_config (
  config_key   TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Backs the CA-XXX-YYYY-NNNNNN / CA-XXX-NNNNNN ID generator. One row per
-- sequence key (e.g. 'TRP-2026' for a yearly-reset sequence, 'CUS' for a
-- permanent one). Incremented inside the same transaction as the row insert.
CREATE TABLE IF NOT EXISTS id_sequences (
  sequence_key TEXT PRIMARY KEY,
  next_value   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
