import { describe, it, expect, vi } from "vitest";
import { GET, POST } from "../../src/app/api/settings/route";

vi.mock("../../src/server/domain/settings/configRepository", () => {
  let mockStore: Record<string, string> = { test_key: "test_val" };
  return {
    getAllConfigs: vi.fn(() => mockStore),
    setConfig: vi.fn((k, v) => { mockStore[k] = v; }),
  };
});

describe("Settings API Route", () => {
  it("GET should return all configs", async () => {
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual({ test_key: "test_val" });
  });

  it("POST should update configs", async () => {
    const req = new Request("http://localhost/api/settings", {
      method: "POST",
      body: JSON.stringify({ key: "new_key", value: "new_val" }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ok).toBe(true);

    const getRes = await GET();
    const getJson = await getRes.json();
    expect(getJson.new_key).toBe("new_val");
  });
});
