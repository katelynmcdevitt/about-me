"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clapperboard, Film, Plus, Search, Tv, X } from "lucide-react";
import styles from "./Watchlist.module.css";

type Kind = "Movie" | "TV show";
type Status = "Want to watch" | "Watching" | "Watched";
type Entry = { id: string; title: string; kind: Kind; status: Status; where: string; notes: string; label?: string; tmdbUrl?: string; cover?: { url: string; sourceUrl: string } };
const key = "watchlist-v1";
const blank: Omit<Entry, "id"> = { title: "", kind: "Movie", status: "Want to watch", where: "", notes: "" };
const filters = ["All titles", "Want to watch", "Watching", "Watched"] as const;

export default function Watchlist() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<(typeof filters)[number] | "For Owen">("All titles");
  const [kind, setKind] = useState<"All" | Kind>("All");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Omit<Entry, "id"> | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [watchmode, setWatchmode] = useState<Record<string, { title: string; kind: Kind; tmdbUrl?: string; where?: string; cover?: { url: string; sourceUrl: string }; error?: string; expiresAt: number }>>({});
  const [watchmodeBusy, setWatchmodeBusy] = useState<string | null>(null);
  const [coverMessage, setCoverMessage] = useState("");
  const [brokenCovers, setBrokenCovers] = useState<Record<string, string>>({});
  const [automaticMessage, setAutomaticMessage] = useState("");
  const automaticStarted = useRef(false);
  const attempted = useRef(new Set<string>());
  const lookupInFlight = useRef(false);
  const newTitleLookupPending = useRef(false);
  const lastLookupFinished = useRef(0);
  const latestEntries = useRef(entries);
  latestEntries.current = entries;

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
    let sessionResult: { where?: string; cover?: { url: string; sourceUrl: string } } | undefined;
    if (!editing) {
      const params = new URLSearchParams({ title: entry.title, kind: entry.kind });
      await Promise.all([
        (async () => { try { const response = await fetch(`/api/watchlist/cover?${params}`, { signal: AbortSignal.timeout(9000) }); if (response.ok) { const data = await response.json(); if (data.cover) entry.cover = data.cover; } } catch { /* Keep the title if the cover lookup fails. */ } })(),
        (async () => {
          newTitleLookupPending.current = true;
          try {
            while (lookupInFlight.current || Date.now() - lastLookupFinished.current < 2000) await new Promise((resolve) => setTimeout(resolve, 100));
            lookupInFlight.current = true;
            const response = await fetch("/api/watchlist/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: entry.title, kind: entry.kind, tmdbUrl: entry.tmdbUrl }), cache: "no-store", signal: AbortSignal.timeout(9000) });
            if (response.ok) { const data = await response.json(); if (typeof data.where === "string" || data.cover) sessionResult = data; }
          } catch { /* Availability is optional. */ }
          finally { lookupInFlight.current = false; newTitleLookupPending.current = false; lastLookupFinished.current = Date.now(); }
        })(),
      ]);
    }
    if (await commit({ action: editing ? "edit" : "add", entry })) { if (sessionResult) setWatchmode((current) => ({ ...current, [entry.id]: { title: entry.title, kind: entry.kind, tmdbUrl: entry.tmdbUrl, ...sessionResult, expiresAt: Date.now() + 86400000 } })); setDraft(null); setEditing(null); setCoverMessage(""); }
    setSaving(false);
  }
  async function lookupWatchmode(entry: Entry) {
    if (lookupInFlight.current || newTitleLookupPending.current || saving) return;
    lookupInFlight.current = true;
    attempted.current.add(entry.id);
    setWatchmodeBusy(entry.id);
    try {
      const delay = Math.max(0, 2000 - (Date.now() - lastLookupFinished.current));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const response = await fetch("/api/watchlist/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: entry.title, kind: entry.kind, tmdbUrl: entry.tmdbUrl }), cache: "no-store", signal: AbortSignal.timeout(9000) });
      const data = await response.json();
      setWatchmode((current) => ({ ...current, [entry.id]: { title: entry.title, kind: entry.kind, tmdbUrl: entry.tmdbUrl, ...(response.ok && (typeof data.where === "string" || data.cover) ? { ...(data.where ? { where: data.where } : {}), ...(data.cover ? { cover: data.cover } : {}) } : { error: response.ok ? "No matching streaming options found." : data.error || "Watchmode is unavailable." }), expiresAt: Date.now() + 86400000 } }));
    } catch { setWatchmode((current) => ({ ...current, [entry.id]: { title: entry.title, kind: entry.kind, tmdbUrl: entry.tmdbUrl, error: "Watchmode is unavailable. Please try again.", expiresAt: Date.now() + 86400000 } })); }
    finally { lookupInFlight.current = false; lastLookupFinished.current = Date.now(); setWatchmodeBusy(null); }
  }
  useEffect(() => {
    const removeExpired = () => setWatchmode((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value.expiresAt > Date.now())));
    const timer = window.setInterval(removeExpired, 60000);
    document.addEventListener("visibilitychange", removeExpired);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", removeExpired); };
  }, []);
  // Check the initial collection once, one title at a time, to limit credit use.
  useEffect(() => {
    if (!ready || automaticStarted.current) return;
    automaticStarted.current = true;
    const queue = entries.filter((entry) => !entry.cover);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    async function next(index: number): Promise<void> {
      if (cancelled || index >= queue.length) return;
      const entry = queue[index];
      const current = latestEntries.current.find((item) => item.id === entry.id);
      if (!current || current.cover || current.title !== entry.title || current.kind !== entry.kind || current.tmdbUrl !== entry.tmdbUrl || attempted.current.has(entry.id)) { timer = setTimeout(() => void next(index + 1), 0); return; }
      if (lookupInFlight.current || newTitleLookupPending.current || Date.now() - lastLookupFinished.current < 2000) { timer = setTimeout(() => void next(index), 500); return; }
      lookupInFlight.current = true;
      attempted.current.add(entry.id);
      setWatchmodeBusy(entry.id);
      let stop = false;
      try {
        const response = await fetch("/api/watchlist/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: entry.title, kind: entry.kind, tmdbUrl: entry.tmdbUrl }), cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(9000)]) });
        if (!response.ok) { stop = true; if (!cancelled) setAutomaticMessage("Automatic artwork lookup paused. Use Check streaming to try again."); }
        else {
          const data = await response.json();
          if (!cancelled && (typeof data.where === "string" || data.cover)) setWatchmode((previous) => ({ ...previous, [entry.id]: { title: entry.title, kind: entry.kind, tmdbUrl: entry.tmdbUrl, ...(typeof data.where === "string" ? { where: data.where } : {}), ...(data.cover ? { cover: data.cover } : {}), expiresAt: Date.now() + 86400000 } }));
        }
      } catch { stop = true; if (!cancelled) setAutomaticMessage("Automatic artwork lookup paused. Use Check streaming to try again."); }
      finally { lookupInFlight.current = false; lastLookupFinished.current = Date.now(); if (!cancelled) setWatchmodeBusy(null); }
      if (!cancelled && !stop) timer = setTimeout(() => void next(index + 1), 2000);
    }
    if (queue.length) timer = setTimeout(() => void next(0), 500);
    return () => { cancelled = true; abort.abort(); if (timer) clearTimeout(timer); };
  }, [ready]);
  async function lookupCover() {
    if (!draft?.title.trim() || lookingUp) { setCoverMessage("Enter a title first."); return; }
    const title = draft.title.trim(), kind = draft.kind;
    setLookingUp(true); setCoverMessage("");
    try {
      const params = new URLSearchParams({ title, kind });
      const response = await fetch(`/api/watchlist/cover?${params}`, { signal: AbortSignal.timeout(9000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.cover && typeof data.cover.url === "string" && typeof data.cover.sourceUrl === "string") {
        setDraft((current) => current && current.title.trim() === title && current.kind === kind ? { ...current, cover: data.cover } : current);
        setCoverMessage("Artwork found. Save to keep it.");
      } else setCoverMessage("No unambiguous artwork match found.");
    } catch { setCoverMessage("Artwork lookup unavailable. Please try again."); }
    finally { setLookingUp(false); }
  }
  async function remove(entry: Entry) {
    if (saving || !window.confirm(`Remove “${entry.title}” from your watchlist?`)) return;
    setSaving(true);
    await commit({ action: "delete", id: entry.id });
    setSaving(false);
  }
  const visible = useMemo(() => entries
    .filter((entry) => (filter === "All titles" || (filter === "For Owen" ? entry.label?.trim().toLowerCase() === "for owen" : entry.status === filter)) && (kind === "All" || entry.kind === kind) && `${entry.title} ${entry.where} ${entry.notes} ${entry.label ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true })), [entries, filter, kind, query]);
  const count = (status: Status) => entries.filter((entry) => entry.status === status).length;

  return <div className={styles.page}>
    <aside className={styles.sidebar} aria-label="Watchlist navigation">
      <div className={styles.brand}><span className={styles.brandMark}><Clapperboard size={19} /></span> watch<span>list</span></div>
      <div className={styles.sideLabel}>YOUR WATCHLIST</div>
      <nav className={styles.sideNav} aria-label="Filter by status">{filters.map((f) => <button key={f} className={filter === f ? styles.activeFilter : ""} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f}<span aria-hidden="true">{f === "All titles" ? entries.length : count(f)}</span></button>)}</nav>
      <div className={styles.sideLabel}>TYPE</div>
      <nav className={styles.sideNav} aria-label="Browse by type">{([ ["TV show", "TV shows"], ["Movie", "Movies"] ] as const).map(([value, label]) => <button key={value} className={kind === value ? styles.activeFilter : ""} onClick={() => setKind(kind === value ? "All" : value)} aria-pressed={kind === value}>{label}<span aria-hidden="true">{entries.filter((entry) => entry.kind === value).length}</span></button>)}</nav>
      <div className={styles.sideLabel}>LABELS</div>
      <nav className={styles.sideNav} aria-label="Filter by label"><button className={filter === "For Owen" ? styles.activeFilter : ""} onClick={() => setFilter("For Owen")} aria-pressed={filter === "For Owen"}>For Owen<span aria-hidden="true">{entries.filter((entry) => entry.label?.trim().toLowerCase() === "for owen").length}</span></button></nav>
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
        {storageError && !draft && <p role="alert" className={styles.error}>{storageError}</p>}{automaticMessage && <p className={styles.lookupMessage} role="status">{automaticMessage}</p>}
        {!ready ? <p className={styles.empty}>{storageError ? "Reload the page to try again." : "Loading your list…"}</p> : visible.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}><Film size={25} /></div><h3>{entries.length ? "No titles found" : "Your list is ready for its first title"}</h3><p>{entries.length ? "Try a different search or filter." : "Add a movie or show you’ve been meaning to watch."}</p>{!entries.length && <button className={styles.textButton} onClick={() => setDraft({ ...blank })}>+ Add your first title</button>}</div> : <div className={styles.cards}>{visible.map((entry, i) => { const live = watchmode[entry.id]?.title === entry.title && watchmode[entry.id]?.kind === entry.kind && watchmode[entry.id]?.tmdbUrl === entry.tmdbUrl && watchmode[entry.id]?.expiresAt > Date.now() ? watchmode[entry.id] : undefined; const displayedCover = entry.cover ?? live?.cover; const hasArtwork = displayedCover && brokenCovers[entry.id] !== displayedCover.url; return <article className={styles.card} key={entry.id}><div className={`${styles.cardArt} ${styles[`tone${i % 4}`]}`}>{hasArtwork && <img className={styles.cover} src={displayedCover.url} alt="" onError={() => setBrokenCovers((current) => ({ ...current, [entry.id]: displayedCover.url }))} />}<span>{entry.kind === "Movie" ? <Film size={20} /> : <Tv size={20} />}</span><div className={styles.cardInitial}>{entry.title.charAt(0).toUpperCase()}</div><small>{entry.kind.toUpperCase()}</small></div><div className={styles.cardBody}><div className={styles.cardMeta}><span>{entry.kind}</span><span className={styles.status}>{entry.status}</span></div><h3 aria-label={entry.title}>{hasArtwork ? entry.title : <a className={styles.titleLink} href={`https://www.imdb.com/find/?q=${encodeURIComponent(entry.title)}&s=tt`} target="_blank" rel="noreferrer" aria-label={`Search IMDb for ${entry.title}`}>{entry.title}</a>}</h3>{entry.label && <span className={styles.labelBadge}>{entry.label}</span>}<p>{entry.where || "No saved viewing note"}</p>{live && <p role="status">{live.where ? `Watchmode · ${live.where}` : live.error ?? "No streaming options found on Watchmode."}</p>}{entry.notes && <p className={styles.notes}>{entry.notes}</p>}<div className={styles.cardActions}><button disabled={saving || watchmodeBusy !== null} onClick={() => void lookupWatchmode(entry)}>{watchmodeBusy === entry.id ? "Checking…" : "Check streaming"}</button>{displayedCover && <a href={displayedCover.sourceUrl} target="_blank" rel="noreferrer">{displayedCover.sourceUrl.includes("themoviedb.org") ? "TMDB" : entry.kind === "Movie" ? "View on iTunes" : "TVMaze"} ↗</a>}{entry.tmdbUrl && !displayedCover?.sourceUrl.startsWith("https://www.themoviedb.org/") && <a href={entry.tmdbUrl} target="_blank" rel="noreferrer">TMDB ↗</a>}{entry.kind === "TV show" && !entry.cover?.sourceUrl.startsWith("https://www.tvmaze.com/") && <a href={`https://www.tvmaze.com/search?q=${encodeURIComponent(entry.title)}`} target="_blank" rel="noreferrer">Search TVMaze ↗</a>}<button disabled={saving} onClick={() => { setEditing(entry.id); setDraft({ title: entry.title, kind: entry.kind, status: entry.status, where: entry.where, notes: entry.notes, label: entry.label, tmdbUrl: entry.tmdbUrl, cover: entry.cover }); }}>Edit details ↗</button><button disabled={saving} onClick={() => void remove(entry)}>Remove</button></div></div></article>})}</div>}
      </section><footer className={styles.footer}><span>THE WATCHLIST <b>✳</b></span><span>MADE FOR YOUR NEXT NIGHT IN</span></footer><section className={styles.credits} aria-label="Data credits"><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" alt="TMDB" /></a><p>This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability provided by <a href="https://www.watchmode.com" target="_blank" rel="noreferrer">Watchmode</a>. Older saved results may include data from JustWatch. Original TV network data provided by <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer">TVMaze</a>.</p></section>
    </main>
    {draft && <div className={styles.overlay} onMouseDown={(e) => { if (!saving && !lookingUp && e.target === e.currentTarget) { setCoverMessage(""); setDraft(null); } }}><div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className={styles.dialogHeader}><div><div className={styles.eyebrow}>YOUR COLLECTION</div><h2 id="dialog-title">{editing ? "Edit title" : "Add to the list"}</h2></div><button className={styles.close} aria-label="Close" disabled={saving || lookingUp} onClick={() => { setCoverMessage(""); setDraft(null); }}><X size={20} /></button></div><form className="site-form" onSubmit={save}>{storageError && <p role="alert" className={styles.error}>{storageError}</p>}<fieldset className={styles.formFields} disabled={saving || lookingUp}><label>Title <input autoFocus required disabled={lookingUp} maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="What do you want to watch?" /></label><div className={styles.formRow}><label>Type<select disabled={lookingUp} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })}><option>Movie</option><option>TV show</option></select></label><label>Status<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>{filters.slice(1).map((f) => <option key={f}>{f}</option>)}</select></label></div><button type="button" className={styles.lookupButton} onClick={() => void lookupCover()} disabled={lookingUp || saving}>{lookingUp ? "Looking up…" : "Find artwork"}</button>{coverMessage && <p className={styles.lookupMessage} role="status">{coverMessage}</p>}<label>Where to watch <span className={styles.optional}>OPTIONAL</span><input disabled={lookingUp} maxLength={200} value={draft.where} onChange={(e) => setDraft({ ...draft, where: e.target.value })} placeholder="Add your own viewing note" /></label><label>TMDB title link <span className={styles.optional}>OPTIONAL</span><input type="url" maxLength={2048} value={draft.tmdbUrl ?? ""} onChange={(e) => setDraft({ ...draft, tmdbUrl: e.target.value })} placeholder="https://www.themoviedb.org/movie/…" /></label><label>Label <span className={styles.optional}>OPTIONAL</span><input maxLength={80} value={draft.label ?? ""} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. For Owen" /></label><label>Notes <span className={styles.optional}>OPTIONAL</span><textarea maxLength={1000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Anything you want to remember" rows={3} /></label><div className={styles.formActions}><button type="button" disabled={saving || lookingUp} onClick={() => { setCoverMessage(""); setDraft(null); }}>Cancel</button><button type="submit" className={`${styles.primary} site-button`} disabled={saving || lookingUp}> {saving ? "Looking up title…" : editing ? "Save changes" : "Add title"} →</button></div></fieldset></form></div></div>}
  </div>;
}
