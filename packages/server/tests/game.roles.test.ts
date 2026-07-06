import { describe, it, expect } from "vitest";
import { assignRoles } from "../src/game/roles.js";
import { getImpostorCount } from "@amongus/shared";

describe("assignRoles", () => {
  it("assigns correct number of impostors", () => {
    const ids = ["u1", "u2", "u3", "u4"];
    const roles = assignRoles(ids);
    const impostors = [...roles.values()].filter((r) => r === "IMPOSTOR");
    expect(impostors.length).toBe(getImpostorCount(4));
    expect(impostors.length).toBe(1);
  });

  it("assigns 2 impostors for 6 players", () => {
    const ids = ["u1", "u2", "u3", "u4", "u5", "u6"];
    const roles = assignRoles(ids);
    const impostors = [...roles.values()].filter((r) => r === "IMPOSTOR");
    expect(impostors.length).toBe(2);
  });

  it("assigns 3 impostors for 10 players", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `u${i}`);
    const roles = assignRoles(ids);
    const impostors = [...roles.values()].filter((r) => r === "IMPOSTOR");
    expect(impostors.length).toBe(3);
  });

  it("assigns all players a role", () => {
    const ids = ["u1", "u2", "u3", "u4"];
    const roles = assignRoles(ids);
    expect(roles.size).toBe(4);
    for (const id of ids) {
      expect(roles.has(id)).toBe(true);
    }
  });

  it("assigns only IMPOSTOR or CREW", () => {
    const ids = ["u1", "u2", "u3", "u4", "u5"];
    const roles = assignRoles(ids);
    for (const role of roles.values()) {
      expect(["IMPOSTOR", "CREW"]).toContain(role);
    }
  });

  it("produces different results across calls (randomness)", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `u${i}`);
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const roles = assignRoles(ids);
      const impostorKey = [...roles.entries()]
        .filter(([, r]) => r === "IMPOSTOR")
        .map(([id]) => id)
        .sort()
        .join(",");
      results.add(impostorKey);
    }
    // With C(8,2)=28 possible impostor pairs, 20 calls should yield variety
    expect(results.size).toBeGreaterThan(5);
  });
});
