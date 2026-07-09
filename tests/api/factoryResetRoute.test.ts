import { describe, it, expect, vi } from "vitest";
import { POST } from "../../src/app/api/settings/factory-reset/route";
import { productionWipe } from "../../src/server/db/production-wipe";

vi.mock("../../src/server/db/production-wipe", () => ({
  productionWipe: vi.fn(),
}));

describe("Factory Reset API Route", () => {
  it("should call productionWipe on POST", async () => {
    const res = await POST(new Request("http://localhost/api/settings/factory-reset", { method: "POST" }));
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(productionWipe).toHaveBeenCalledTimes(1);
  });
});
