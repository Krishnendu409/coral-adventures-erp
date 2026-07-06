import { describe, it, expect, vi } from "vitest";
import { getConfig, setConfig, getAllConfigs } from "../../src/server/domain/settings/configRepository";

// Mock the getDb function
vi.mock("../../src/server/db/client", () => {
  const store = new Map<string, string>();
  return {
    getDb: vi.fn(() => ({
      prepare: vi.fn((query: string) => ({
        get: vi.fn((key: string) => {
          if (query.includes("SELECT config_value")) {
            return store.has(key) ? { config_value: store.get(key) } : undefined;
          }
        }),
        all: vi.fn(() => {
          if (query.includes("SELECT config_key")) {
            return Array.from(store.entries()).map(([k, v]) => ({ config_key: k, config_value: v }));
          }
          return [];
        }),
        run: vi.fn((key: string, val: string) => {
          if (query.includes("INSERT OR REPLACE") || query.includes("UPDATE") || query.includes("INSERT")) {
            store.set(key, val);
          }
        }),
      })),
      transaction: vi.fn((cb) => cb),
    }))
  };
});

describe("Config Repository", () => {
  it("should return null for non-existent config", () => {
    expect(getConfig("test_key")).toBeNull();
  });

  it("should store and retrieve config values", () => {
    setConfig("test_key", "test_value");
    expect(getConfig("test_key")).toBe("test_value");
  });

  it("should overwrite existing config values", () => {
    setConfig("test_key", "test_value");
    setConfig("test_key", "new_value");
    expect(getConfig("test_key")).toBe("new_value");
  });

  it("should retrieve all configs as a record", () => {
    setConfig("key1", "val1");
    setConfig("key2", "val2");
    
    const all = getAllConfigs();
    expect(all).toEqual({
      key1: "val1",
      key2: "val2",
      test_key: "new_value"
    });
  });
});
