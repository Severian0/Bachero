"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Mark } from "./Logo";
import { DepotMap } from "./settings/DepotMap";
import { createDataSource } from "@/lib/data";
import type { ConsoleDataSource, Crew } from "@/lib/data/types";
import { parseDraft, type Draft } from "@/lib/settings/crewForm";

/**
 * Crews and depots, at /settings. A page rather than a sheet: the dispatch
 * sheet is the console's one interruption, and setting up a crew is not an
 * interruption of anything, it is done before the day starts.
 *
 * The column holds the records and the form; the map holds every depot and
 * takes a tap to place the one being edited. Both read the same data source
 * the console uses, so a crew saved here is in the dispatch sheet's list the
 * next time the console loads.
 */
export default function CrewSettings() {
  const [ds, setDs] = useState<ConsoleDataSource | null>(null);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const source = await createDataSource();
      if (cancelled) return;
      setDs(source);
      try {
        const res = await source.load();
        if (cancelled) return;
        setCrews(res.crews);
        setLoadState("ready");
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Unknown error");
        setLoadState("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const startNew = useCallback((lng?: number, lat?: number) => {
    setConfirmDelete(null);
    setForm({
      id: null, name: "", shift_minutes: "480", repairs_per_shift: "12",
      lng: lng === undefined ? "" : lng.toFixed(5), lat: lat === undefined ? "" : lat.toFixed(5),
      error: null, saving: false,
    });
  }, []);

  const startEdit = useCallback((c: Crew) => {
    setConfirmDelete(null);
    setForm({
      id: c.id, name: c.name, shift_minutes: String(c.shift_minutes), repairs_per_shift: String(c.repairs_per_shift),
      lng: c.depot_lng.toFixed(5), lat: c.depot_lat.toFixed(5), error: null, saving: false,
    });
  }, []);

  // A tap on the map places the depot of the crew in the form, or starts a
  // new crew there when no form is open: the map is the fastest way to say where.
  const pick = useCallback((lng: number, lat: number) => {
    setForm((f) => (f ? { ...f, lng: lng.toFixed(5), lat: lat.toFixed(5), error: null } : f));
    if (!form) startNew(lng, lat);
  }, [form, startNew]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || !ds) return;
    const parsed = parseDraft(form);
    if ("error" in parsed) { setForm({ ...form, error: parsed.error }); return; }
    setForm({ ...form, saving: true, error: null });
    try {
      const saved = await ds.saveCrew(parsed.input);
      setCrews((cs) => (cs.some((c) => c.id === saved.id) ? cs.map((c) => (c.id === saved.id ? saved : c)) : [...cs, saved]));
      setForm(null);
    } catch (err) {
      setForm({ ...form, saving: false, error: err instanceof Error ? err.message : "The crew could not be saved." });
    }
  };

  const remove = async (id: string) => {
    if (!ds) return;
    setRowError(null);
    try {
      await ds.deleteCrew(id);
      setCrews((cs) => cs.filter((c) => c.id !== id));
      setConfirmDelete(null);
      if (form?.id === id) setForm(null);
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "The crew could not be deleted." });
      setConfirmDelete(null);
    }
  };

  const draftPoint = form && form.lng !== "" && form.lat !== "" && Number.isFinite(Number(form.lng)) && Number.isFinite(Number(form.lat))
    ? { lng: Number(form.lng), lat: Number(form.lat), name: form.name }
    : null;

  return (
    <div className="settings-frame">
      <header className="console-header">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s4)", minWidth: 0 }}>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
            <span style={{ color: "var(--rail-ink)", ["--mark-void" as string]: "var(--rail)", display: "flex" }}>
              <Mark size={26} />
            </span>
            <span style={{ fontSize: "var(--t-lead)", fontWeight: 700, letterSpacing: "0.11em", textTransform: "uppercase", lineHeight: 1 }}>
              Bachero
            </span>
          </h1>
          <span aria-hidden style={{ width: 1, height: 22, background: "var(--rail-rule)", flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: "var(--t-small)", color: "var(--rail-ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Crews and depots
          </p>
        </div>
        <Link href="/" className="btn btn-sm" style={{ color: "var(--rail-ink)", borderColor: "var(--rail-rule)", background: "var(--rail-2)", flexShrink: 0 }}>
          <span className="hdr-tagline">Back to console</span>
          <span className="settings-back-short">Console</span>
        </Link>
      </header>

      <main className="settings-main">
        <section className="settings-column" aria-label="Crews">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s3)", padding: "var(--s3) var(--s4)", borderBottom: "1px solid var(--rule-soft)", background: "var(--canvas)" }}>
            <div>
              <h2 className="micro">Crews</h2>
              <p className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
                {loadState === "ready" ? `${crews.length} ${crews.length === 1 ? "crew" : "crews"}, each with one depot` : loadState === "loading" ? " " : "Could not load crews"}
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => startNew()} disabled={loadState !== "ready" || (form !== null && form.id === null)}>
              Add crew
            </button>
          </div>

          <div className="settings-scroll">
            {form && (
              <form onSubmit={save} style={{ display: "grid", gap: "var(--s3)", padding: "var(--s4)", borderBottom: "1px solid var(--rule)", background: "var(--action-soft)" }}>
                <h3 style={{ fontSize: "var(--t-lead)" }}>{form.id ? "Edit crew" : "New crew"}</h3>
                <Field label="Crew name">
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, error: null })} autoComplete="off" />
                </Field>
                <div className="settings-form-grid">
                  <Field label="Depot latitude">
                    <input className="data input" inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value, error: null })} placeholder="51.4994" />
                  </Field>
                  <Field label="Depot longitude">
                    <input className="data input" inputMode="decimal" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value, error: null })} placeholder="-0.1246" />
                  </Field>
                </div>
                <p className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
                  Tap the map to place the depot, or type its coordinates.
                </p>
                <div className="settings-form-grid">
                  <Field label="Shift, minutes">
                    <input className="data input" inputMode="numeric" value={form.shift_minutes} onChange={(e) => setForm({ ...form, shift_minutes: e.target.value, error: null })} />
                  </Field>
                  <Field label="Repairs per shift">
                    <input className="data input" inputMode="numeric" value={form.repairs_per_shift} onChange={(e) => setForm({ ...form, repairs_per_shift: e.target.value, error: null })} />
                  </Field>
                </div>
                {form.error && (
                  <p role="alert" style={{ margin: 0, fontSize: "var(--t-small)", fontWeight: 600, color: "var(--severe)" }}>
                    {form.error}
                  </p>
                )}
                <div className="settings-actions">
                  <button type="submit" className="btn btn-primary" disabled={form.saving}>
                    {form.saving ? "Saving" : "Save crew"}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setForm(null)} disabled={form.saving}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {loadState === "error" && (
              <p className="secondary" style={{ margin: 0, padding: "var(--s5) var(--s4)", fontSize: "var(--t-small)" }}>
                Could not load crews. {loadError}
              </p>
            )}
            {loadState === "ready" && crews.length === 0 && !form && (
              <p className="secondary" style={{ margin: 0, padding: "var(--s5) var(--s4)", fontSize: "var(--t-small)" }}>
                No crews yet. Add one, or tap the map where its depot is.
              </p>
            )}
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {crews.map((c) => (
                <li key={c.id} className="crew-row" data-editing={form?.id === c.id ? "" : undefined}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--s3)" }}>
                    <span style={{ fontSize: "var(--t-body)", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span className="data secondary" style={{ fontSize: "var(--t-small)", flexShrink: 0 }}>
                      {c.depot_lat.toFixed(4)}, {c.depot_lng.toFixed(4)}
                    </span>
                  </div>
                  <p className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
                    <span className="data">{c.shift_minutes} min</span> shift · <span className="data">{c.repairs_per_shift}</span> repairs per shift
                  </p>
                  {confirmDelete === c.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "var(--t-small)", fontWeight: 600 }}>Delete {c.name}?</span>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void remove(c.id)}>Delete</button>
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmDelete(null)}>Keep</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "var(--s2)" }}>
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => startEdit(c)}>Edit</button>
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setRowError(null); setConfirmDelete(c.id); }}>Delete</button>
                    </div>
                  )}
                  {rowError?.id === c.id && (
                    <p role="alert" style={{ margin: 0, fontSize: "var(--t-small)", fontWeight: 600, color: "var(--severe)" }}>{rowError.message}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="settings-map" aria-label="Depot map">
          <DepotMap crews={crews} draft={draftPoint} editingId={form?.id ?? null} onPick={pick} />
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span className="micro secondary" style={{ display: "block", marginBottom: "var(--s1)" }}>{label}</span>
      {children}
    </label>
  );
}
