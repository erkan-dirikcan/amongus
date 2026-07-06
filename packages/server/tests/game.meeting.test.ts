import { describe, it, expect } from "vitest";
import { tallyVotes } from "../src/game/meeting.js";

describe("tallyVotes", () => {
  it("returns no ejection when no votes", () => {
    const votes = new Map<string, string | "skip">();
    const result = tallyVotes(votes);
    expect(result.ejected).toBeNull();
    expect(result.wasTie).toBe(false);
  });

  it("ejects player with most votes", () => {
    const votes = new Map<string, string | "skip">([
      ["u1", "u3"],
      ["u2", "u3"],
      ["u3", "u1"],
    ]);
    const result = tallyVotes(votes);
    expect(result.ejected).toBe("u3");
    expect(result.wasTie).toBe(false);
  });

  it("returns tie when two players have equal votes", () => {
    const votes = new Map<string, string | "skip">([
      ["u1", "u2"],
      ["u2", "u3"],
    ]);
    const result = tallyVotes(votes);
    expect(result.ejected).toBeNull();
    expect(result.wasTie).toBe(true);
  });

  it("does not eject when skip has most votes", () => {
    const votes = new Map<string, string | "skip">([
      ["u1", "skip"],
      ["u2", "skip"],
      ["u3", "u1"],
    ]);
    const result = tallyVotes(votes);
    expect(result.ejected).toBeNull();
  });

  it("ejects player even if skip has fewer votes", () => {
    const votes = new Map<string, string | "skip">([
      ["u1", "u2"],
      ["u2", "u2"],
      ["u3", "skip"],
    ]);
    const result = tallyVotes(votes);
    expect(result.ejected).toBe("u2");
  });
});
