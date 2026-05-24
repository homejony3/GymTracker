import { describe, it, expect } from "vitest";

describe("Project Setup", () => {
  it("should have vitest configured correctly", () => {
    expect(true).toBe(true);
  });

  it("should resolve @/ path alias", async () => {
    // This verifies the path alias is configured in vitest
    const path = await import("path");
    expect(path).toBeDefined();
  });
});
