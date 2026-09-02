import { describe, it, expect } from "vitest";
import { createConsoleStore } from "./store";
import { handleKey } from "./keyboard";
import type { Pothole } from "@/lib/data/types";

const mk = (id: string, status: Pothole["status"] = "confirmed"): Pothole => ({
  id, authority_id: "x", road_name: id, street: id, ref: "BCH-" + id, stop_order: null, status, severity: 0.5,
  detection_count: 2, distinct_vehicles: 2, first_detected_at: "2026-08-01T00:00:00Z", last_detected_at: "2026-09-01T00:00:00Z",
  repaired_at: null, updated_at: "2026-09-01T00:00:00Z", lng: 0, lat: 0, photo_url: null, priority: 1,
});
const ev = (key: string, tag = "DIV") => ({ key, target: { tagName: tag } as unknown as EventTarget, preventDefault() {} });

describe("handleKey", () => {
  it("arrows move the link through rows with source keys", () => {
    const s = createConsoleStore();
    const rows = [mk("a"), mk("b"), mk("c")];
    rows.forEach((p) => s.getState().upsertPothole(p));
    expect(handleKey(ev("ArrowDown"), s.getState(), rows)).toBe(true);
    expect(s.getState()).toMatchObject({ linkedId: "a", linkSource: "keys" });
    handleKey(ev("ArrowDown"), s.getState(), rows);
    handleKey(ev("ArrowDown"), s.getState(), rows);
    handleKey(ev("ArrowDown"), s.getState(), rows);
    expect(s.getState().linkedId).toBe("c");
    handleKey(ev("ArrowUp"), s.getState(), rows);
    expect(s.getState().linkedId).toBe("b");
  });
  it("Enter toggles the linked item; Esc unpins, then unlinks, then clears selection", () => {
    const s = createConsoleStore();
    const rows = [mk("a")];
    s.getState().upsertPothole(rows[0]);
    s.getState().link("a", "keys");
    handleKey(ev("Enter"), s.getState(), rows);
    expect(s.getState().selected).toEqual(["a"]);
    s.getState().pin("a");
    handleKey(ev("Escape"), s.getState(), rows);
    expect(s.getState().pinnedId).toBeNull();
    expect(s.getState().linkedId).toBe("a");
    handleKey(ev("Escape"), s.getState(), rows);
    expect(s.getState().linkedId).toBeNull();
    handleKey(ev("Escape"), s.getState(), rows);
    expect(s.getState().selected).toEqual([]);
  });
  it("F cycles the filter; keys in inputs are ignored", () => {
    const s = createConsoleStore();
    handleKey(ev("f"), s.getState(), []);
    expect(s.getState().filter).toBe("suspected");
    expect(handleKey(ev("f", "INPUT"), s.getState(), [])).toBe(false);
    expect(s.getState().filter).toBe("suspected");
  });
});
