"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clapperboard, Film, Plus, Search, Tv, X } from "lucide-react";
import styles from "./Watchlist.module.css";

type Kind = "Movie" | "TV show";
type Status = "Want to watch" | "Watching" | "Watched";
type Entry = { id: string; title: string; kind: Kind; status: Status; where: string; notes: string; cover?: { url: string; sourceUrl: string } };
const key = "watchlist-v1";
const blank: Omit<Entry, "id"> = { title: "", kind: "Movie", status: "Want to watch", where: "", notes: "" };
const filters = ["All titles", "Want to watch", "Watching", "Watched"] as const;

export default function Watchlist() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All titles");
  const [kind, setKind] = useState<"All" | Kind>("All");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Omit<Entry, "id"> | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/watchlist/library", { cache: "no-store" });
        if (!response.ok) throw new Error("The watchlist could not be loaded. Please try again.");
        let data = await response.json();
        if (!data.migrated) {
          let saved: string | null = null;
          try { saved = localStorage.getItem(key); }
          catch { if (!cancelled) setStorageError("Browser storage is unavailable, so any older browser watchlist could not be transferred. Your database is available; enable browser storage and reload to retry the transfer."); }
          if (saved) {
            let parsed: unknown;
            try { parsed = JSON.parse(saved); } catch { throw new Error("Your browser watchlist could not be read. It has not been changed."); }
            if (!Array.isArray(parsed)) throw new Error("Your browser watchlist could not be read. It has not been changed.");
            if (parsed.length) {
              const migration = await fetch("/api/watchlist/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "migrate", entries: parsed, revision: data.revision }) });
              if (migration.status === 409) {
                const latest = await fetch("/api/watchlist/library", { cache: "no-store" });
                if (!latest.ok) throw new Error("Your browser watchlist could not be transferred. Reload to try again; the browser copy has not been changed.");
                data = await latest.json();
                if (!data.migrated) throw new Error("Your browser watchlist could not be transferred. Reload to try again; the browser copy has not been changed.");
              } else {
                if (!migration.ok) throw new Error("Your browser watchlist could not be transferred. Reload to try again; the browser copy has not been changed.");
                data = await migration.json();
              }
            }
          }
        }
        if (!cancelled) { setEntries(data.entries); setRevision(data.revision); setReady(true); }
      } catch (error) {
        if (!cancelled) setStorageError(error instanceof Error ? error.message : "The watchlist could not be loaded.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function commit(command: object) {
    try {
      const response = await fetch("/api/watchlist/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...command, revision }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Your changes could not be saved. Please try again.");
      }
      const data = await response.json();
      setEntries(data.entries); setRevision(data.revision); setStorageError(""); return true;
    } catch (error) { setStorageError(error instanceof Error ? error.message : "Your changes could not be saved. Please try again."); return false; }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !draft.title.trim() || saving) return;
    setSaving(true);
    const entry = { ...draft, title: draft.title.trim(), where: draft.where.trim(), notes: draft.notes.trim(), id: editing ?? crypto.randomUUID() };
    if (!editing) {
      try {
        const params = new URLSearchParams({ title: entry.title, kind: entry.kind });
        const response = await fetch(`/api/watchlist/cover?${params}`, { signal: AbortSignal.timeout(5000) });
        if (response.ok) { const data = await response.json(); if (data.cover) entry.cover = data.cover; }
      } catch { /* Keep the title even when artwork cannot be found. */ }
    }
    if (await commit({ action: editing ? "edit" : "add", entry })) { setDraft(null); setEditing(null); }
    setSaving(false);
  }
  async function remove(entry: Entry) {
    if (saving || !window.confirm(`Remove “${entry.title}” from your watchlist?`)) return;
    setSaving(true);
    await commit({ action: "delete", id: entry.id });
    setSaving(false);
  }
  const visible = useMemo(() => entries.filter((entry) => (filter === "All titles" || entry.status === filter) && (kind === "All" || entry.kind === kind) && `${entry.title} ${entry.where} ${entry.notes}`.toLowerCase().includes(query.toLowerCase().trim())), [entries, filter, kind, query]);
  const count = (status: Status) => entries.filter((entry) => entry.status === status).length;

  return <div className={styles.page}>
    <aside className={styles.sidebar} aria-label="Watchlist navigation">
      <div className={styles.brand}><span className={styles.brandMark}><Clapperboard size={19} /></span> watch<span>list</span></div>
      <div className={styles.sideLabel}>YOUR WATCHLIST</div>
      <nav className={styles.sideNav} aria-label="Filter by status">{filters.map((f) => <button key={f} className={filter === f ? styles.activeFilter : ""} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f}<span aria-hidden="true">{f === "All titles" ? entries.length : count(f)}</span></button>)}</nav>
      <Link href="/apps" className={`${styles.back} site-back-link`}><ArrowLeft size={14} /> All apps</Link>
    </aside>
    <main className={styles.shell}>
      <header className={styles.topbar}><span className={styles.toplabel}>YOUR PERSONAL WATCHLIST</span><span className={styles.localNote}>Saved locally</span></header>
      <section className={styles.hero}>
        <div><h1>The Watchlist</h1><button className={`${styles.primary} site-button`} disabled={!ready || saving} onClick={() => { setEditing(null); setDraft({ ...blank }); }}><Plus size={18} /> Add a title</button></div>
        <Clapperboard className={styles.headerIcon} size={48} strokeWidth={1.3} aria-hidden="true" />
      </section>
      <section className={styles.library}>
        <div className={styles.toolbar}><div className={styles.controls}><label className={styles.search}><Search size={16} /><span className={styles.srOnly}>Search titles</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your list" /></label><label><span className={styles.srOnly}>Filter by type</span><select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="All">All types</option><option>Movie</option><option>TV show</option></select></label></div></div>
        {storageError && !draft && <p role="alert" className={styles.error}>{storageError}</p>}
        {!ready ? <p className={styles.empty}>{storageError ? "Reload the page to try again." : "Loading your list…"}</p> : visible.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}><Film size={25} /></div><h3>{entries.length ? "No titles found" : "Your list is ready for its first title"}</h3><p>{entries.length ? "Try a different search or filter." : "Add a movie or show you’ve been meaning to watch."}</p>{!entries.length && <button className={styles.textButton} onClick={() => setDraft({ ...blank })}>+ Add your first title</button>}</div> : <div className={styles.cards}>{visible.map((entry, i) => <article className={styles.card} key={entry.id}><div className={`${styles.cardArt} ${styles[`tone${i % 4}`]}`}>{entry.cover && <img className={styles.cover} src={entry.cover.url} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />}<span>{entry.kind === "Movie" ? <Film size={20} /> : <Tv size={20} />}</span><div className={styles.cardInitial}>{entry.title.charAt(0).toUpperCase()}</div><small>{entry.kind.toUpperCase()}</small></div><div className={styles.cardBody}><div className={styles.cardMeta}><span>{entry.kind}</span><span className={styles.status}>{entry.status}</span></div><h3>{entry.title}</h3><p>{entry.where || "Where to watch not added"}</p>{entry.notes && <p className={styles.notes}>{entry.notes}</p>}<div className={styles.cardActions}>{entry.cover && <a href={entry.cover.sourceUrl} target="_blank" rel="noreferrer">{entry.kind === "Movie" ? "View on iTunes" : "TVMaze"} ↗</a>}<button disabled={saving} onClick={() => { setEditing(entry.id); setDraft({ title: entry.title, kind: entry.kind, status: entry.status, where: entry.where, notes: entry.notes, cover: entry.cover }); }}>Edit details ↗</button><button disabled={saving} onClick={() => void remove(entry)}>Remove</button></div></div></article>)}</div>}
      </section><footer className={styles.footer}><span>THE WATCHLIST <b>✳</b></span><span>MADE FOR YOUR NEXT NIGHT IN</span></footer>
    </main>
    {draft && <div className={styles.overlay} onMouseDown={(e) => { if (!saving && e.target === e.currentTarget) setDraft(null); }}><div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className={styles.dialogHeader}><div><div className={styles.eyebrow}>YOUR COLLECTION</div><h2 id="dialog-title">{editing ? "Edit title" : "Add to the list"}</h2></div><button className={styles.close} aria-label="Close" disabled={saving} onClick={() => setDraft(null)}><X size={20} /></button></div><form className="site-form" onSubmit={save}>{storageError && <p role="alert" className={styles.error}>{storageError}</p>}<label>Title <input autoFocus required maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="What do you want to watch?" /></label><div className={styles.formRow}><label>Type<select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })}><option>Movie</option><option>TV show</option></select></label><label>Status<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>{filters.slice(1).map((f) => <option key={f}>{f}</option>)}</select></label></div><label>Where to watch <span className={styles.optional}>OPTIONAL</span><input maxLength={200} value={draft.where} onChange={(e) => setDraft({ ...draft, where: e.target.value })} placeholder="e.g. Netflix, theater, or at home" /></label><label>Notes <span className={styles.optional}>OPTIONAL</span><textarea maxLength={1000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Anything you want to remember" rows={3} /></label><div className={styles.formActions}><button type="button" disabled={saving} onClick={() => setDraft(null)}>Cancel</button><button type="submit" className={`${styles.primary} site-button`} disabled={saving}> {saving ? "Looking for cover…" : editing ? "Save changes" : "Add title"} →</button></div></form></div></div>}
  </div>;
}
