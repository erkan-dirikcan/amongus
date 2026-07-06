import { describe, it, expect, beforeEach } from "vitest";
import { GameEngine } from "../src/game/engine.js";
import { VENT_POSITIONS } from "../src/game/vents.js";
import { VENT_INTERACT_DISTANCE } from "@amongus/shared";

describe("GameEngine vent system", () => {
  let engine: GameEngine;
  const players = [
    { userId: "u1", username: "alice", color: "red" },
    { userId: "u2", username: "bob", color: "blue" },
    { userId: "u3", username: "carol", color: "green" },
    { userId: "u4", username: "dave", color: "pink" },
  ];

  beforeEach(() => {
    engine = new GameEngine();
    engine.createMatch("m1", "ABC234", players);
  });

  it("rejects vent entry for crewmates", () => {
    const crew = [...engine.getMatch("m1")!.players.values()].find((p) => p.role === "CREW")!;
    const vent = VENT_POSITIONS[0];
    crew.x = vent.x; crew.y = vent.y;
    const result = engine.ventEnter("m1", crew.userId, vent.id);
    expect(result.success).toBe(false);
  });

  it("allows vent entry for impostor near vent", () => {
    const impostor = [...engine.getMatch("m1")!.players.values()].find((p) => p.role === "IMPOSTOR")!;
    const vent = VENT_POSITIONS[0];
    impostor.x = vent.x; impostor.y = vent.y;
    const result = engine.ventEnter("m1", impostor.userId, vent.id);
    expect(result.success).toBe(true);
    expect(impostor.inVent).toBe(true);
  });

  it("rejects vent entry when too far", () => {
    const impostor = [...engine.getMatch("m1")!.players.values()].find((p) => p.role === "IMPOSTOR")!;
    impostor.x = 0; impostor.y = 0;
    const result = engine.ventEnter("m1", impostor.userId, VENT_POSITIONS[0].id);
    expect(result.success).toBe(false);
  });

  it("allows vent move to another vent", () => {
    const impostor = [...engine.getMatch("m1")!.players.values()].find((p) => p.role === "IMPOSTOR")!;
    const vent = VENT_POSITIONS[0];
    impostor.x = vent.x; impostor.y = vent.y;
    engine.ventEnter("m1", impostor.userId, vent.id);
    const target = VENT_POSITIONS[1];
    const result = engine.ventMove("m1", impostor.userId, target.id);
    expect(result.success).toBe(true);
    expect(impostor.x).toBe(target.x);
    expect(impostor.y).toBe(target.y);
  });

  it("allows vent exit", () => {
    const impostor = [...engine.getMatch("m1")!.players.values()].find((p) => p.role === "IMPOSTOR")!;
    const vent = VENT_POSITIONS[0];
    impostor.x = vent.x; impostor.y = vent.y;
    engine.ventEnter("m1", impostor.userId, vent.id);
    const result = engine.ventExit("m1", impostor.userId);
    expect(result.success).toBe(true);
    expect(impostor.inVent).toBe(false);
  });

  it("rejects double vent entry", () => {
    const impostor = [...engine.getMatch("m1")!.players.values()].find((p) => p.role === "IMPOSTOR")!;
    const vent = VENT_POSITIONS[0];
    impostor.x = vent.x; impostor.y = vent.y;
    engine.ventEnter("m1", impostor.userId, vent.id);
    const result = engine.ventEnter("m1", impostor.userId, vent.id);
    expect(result.success).toBe(false);
  });
});
