import { getDb } from "../../db/client";

export function getConfig(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT config_value FROM app_config WHERE config_key = ?").get(key) as { config_value: string } | undefined;
  return row ? row.config_value : null;
}

export function setConfig(key: string, value: string): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO app_config (config_key, config_value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))").run(key, value);
}

export function getAllConfigs(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT config_key, config_value FROM app_config").all() as Array<{ config_key: string, config_value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.config_key] = row.config_value;
  }
  return result;
}
