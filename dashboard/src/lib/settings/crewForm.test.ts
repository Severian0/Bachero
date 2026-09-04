import { describe, it, expect } from "vitest";
import { parseDraft, type Draft } from "./crewForm";

const ok: Draft = { id: null, name: "Crew B", lng: "-0.11", lat: "51.51", shift_minutes: "480", repairs_per_shift: "12", error: null, saving: false };

describe("crew form", () => {
  it("parses a complete draft, longitude first on the wire", () => {
    expect(parseDraft(ok)).toEqual({ input: { name: "Crew B", depot_lng: -0.11, depot_lat: 51.51, shift_minutes: 480, repairs_per_shift: 12 } });
    expect(parseDraft({ ...ok, id: "c1" })).toMatchObject({ input: { id: "c1" } });
  });
  it("names the field that is wrong", () => {
    expect(parseDraft({ ...ok, name: "  " })).toEqual({ error: "Give the crew a name." });
    expect(parseDraft({ ...ok, lat: "" })).toMatchObject({ error: expect.stringContaining("Place the depot") });
    expect(parseDraft({ ...ok, lat: "95" })).toMatchObject({ error: expect.stringContaining("out of range") });
    expect(parseDraft({ ...ok, shift_minutes: "30" })).toMatchObject({ error: expect.stringContaining("Shift") });
    expect(parseDraft({ ...ok, repairs_per_shift: "0" })).toMatchObject({ error: expect.stringContaining("Repairs") });
  });
});
