"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Clapperboard, Film, Plus, Search, Tv, X } from "lucide-react";
import styles from "./Watchlist.module.css";

type Kind = "Movie" | "TV show";
type Status = "Want to watch" | "Watching" | "Watched";
type Entry = { id: string; title: string; kind: Kind; status: Status; where: string; notes: string };
const key = "watchlist-v1";
const blank: Omit<Entry, "id"> = { title: "", kind: "Movie", status: "Want to watch", where: "", notes: "" };
const filters = ["All titles", "Want to watch", "Watching", "Watched"] as const;

export default function Watchlist() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All titles");
  const [kind, setKind] = useState<"All" | Kind>("All");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Omit<Entry, "id"> | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every((e) => e && typeof e.id === "string" && typeof e.title === "string" && ["Movie", "TV show"].includes(e.kind) && ["Want to watch", "Watching", "Watched"].includes(e.status) && typeof e.where === "string" && typeof e.notes === "string")) throw new Error("Invalid saved data");
        setEntries(parsed as Entry[]);
      }
    } catch { setStorageError("Your saved watchlist could not be read. It has not been changed."); }
    setReady(true);
  }, []);

  function commit(next: Entry[]) {
    try { localStorage.setItem(key, JSON.stringify(next)); setEntries(next); setStorageError(""); return true; }
    catch { setStorageError("Your changes could not be saved in this browser. Please try again."); return false; }
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !draft.title.trim()) return;
    const entry = { ...draft, title: draft.title.trim(), where: draft.where.trim(), notes: draft.notes.trim(), id: editing ?? crypto.randomUUID() };
    if (commit(editing ? entries.map((item) => item.id === editing ? entry : item) : [entry, ...entries])) { setDraft(null); setEditing(null); }
  }
  function remove(entry: Entry) {
    if (window.confirm(`Remove “${entry.title}” from your watchlist?`)) commit(entries.filter((item) => item.id !== entry.id));
  }
  const visible = useMemo(() => entries.filter((entry) => (filter === "All titles" || entry.status === filter) && (kind === "All" || entry.kind === kind) && `${entry.title} ${entry.where} ${entry.notes}`.toLowerCase().includes(query.toLowerCase().trim())), [entries, filter, kind, query]);
  const count = (status: Status) => entries.filter((entry) => entry.status === status).length;

  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.topbar}><Link href="/apps" className={styles.back}>← All apps</Link><span className={styles.toplabel}>YOUR PERSONAL WATCHLIST</span></header>
      <section className={styles.hero}>
        <div><div className={styles.eyebrow}><span /> THE WATCHLIST</div><h1>Good stories,<br /><em>saved for later.</em></h1><p>Keep track of the movies and shows you can’t wait to watch. Your next favorite is right here.</p><button className={styles.primary} onClick={() => { setEditing(null); setDraft({ ...blank }); }}><Plus size={18} /> Add a title</button></div>
        <div className={styles.heroArt} aria-hidden="true"><div className={styles.orbit}></div><div className={styles.ticket}><Clapperboard size={42} strokeWidth={1.2} /><span>THE<br />WATCH<br />LIST<span className={styles.dot}>.</span></span><small>YOUR NEXT GREAT STORY</small></div><span className={styles.sparkle}>✳</span><span className={styles.star}>✦</span></div>
      </section>
      <section className={styles.library}>
        <div className={styles.sectionHeader}><div><div className={styles.eyebrow}>YOUR COLLECTION</div><h2>The list <span>{entries.length.toString().padStart(2, "0")}</span></h2></div><p>A little less scrolling, a little more watching.</p></div>
        <div className={styles.stats}><div><strong>{entries.length}</strong><span>ALL TITLES</span></div><div><strong>{count("Want to watch")}</strong><span>ON THE LIST</span></div><div><strong>{count("Watching")}</strong><span>IN PROGRESS</span></div><div><strong>{count("Watched")}</strong><span>WATCHED</span></div></div>
        <div className={styles.toolbar}><div className={styles.tabs} aria-label="Filter by status">{filters.map((f) => <button key={f} className={filter === f ? styles.activeTab : ""} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f}</button>)}</div><div className={styles.controls}><label className={styles.search}><Search size={16} /><span className={styles.srOnly}>Search titles</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your list" /></label><label><span className={styles.srOnly}>Filter by type</span><select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="All">All types</option><option>Movie</option><option>TV show</option></select></label></div></div>
        {storageError && <p role="alert" className={styles.error}>{storageError}</p>}
        {!ready ? <p className={styles.empty}>Loading your list…</p> : visible.length === 0 ? <div className={styles.empty}><div className={styles.emptyIcon}><Film size={25} /></div><h3>{entries.length ? "No titles found" : "Your list is ready for its first title"}</h3><p>{entries.length ? "Try a different search or filter." : "Add a movie or show you’ve been meaning to watch."}</p>{!entries.length && <button className={styles.textButton} onClick={() => setDraft({ ...blank })}>+ Add your first title</button>}</div> : <div className={styles.cards}>{visible.map((entry, i) => <article className={styles.card} key={entry.id}><div className={`${styles.cardArt} ${styles[`tone${i % 4}`]}`}><span>{entry.kind === "Movie" ? <Film size={20} /> : <Tv size={20} />}</span><div className={styles.cardInitial}>{entry.title.charAt(0).toUpperCase()}</div><small>{entry.kind.toUpperCase()}</small></div><div className={styles.cardBody}><div className={styles.cardMeta}><span>{entry.kind}</span><span className={styles.status}>{entry.status}</span></div><h3>{entry.title}</h3><p>{entry.where || "Where to watch not added"}</p>{entry.notes && <p className={styles.notes}>{entry.notes}</p>}<div className={styles.cardActions}><button onClick={() => { setEditing(entry.id); setDraft({ title: entry.title, kind: entry.kind, status: entry.status, where: entry.where, notes: entry.notes }); }}>Edit details ↗</button><button onClick={() => remove(entry)}>Remove</button></div></div></article>)}</div>}
      </section><footer className={styles.footer}><span>THE WATCHLIST <b>✳</b></span><span>MADE FOR YOUR NEXT NIGHT IN</span></footer>
    </div>
    {draft && <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setDraft(null); }}><div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className={styles.dialogHeader}><div><div className={styles.eyebrow}>YOUR COLLECTION</div><h2 id="dialog-title">{editing ? "Edit title" : "Add to the list"}</h2></div><button className={styles.close} aria-label="Close" onClick={() => setDraft(null)}><X size={20} /></button></div><form onSubmit={save}><label>Title <input autoFocus required maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="What do you want to watch?" /></label><div className={styles.formRow}><label>Type<select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })}><option>Movie</option><option>TV show</option></select></label><label>Status<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>{filters.slice(1).map((f) => <option key={f}>{f}</option>)}</select></label></div><label>Where to watch <span className={styles.optional}>OPTIONAL</span><input maxLength={200} value={draft.where} onChange={(e) => setDraft({ ...draft, where: e.target.value })} placeholder="e.g. Netflix, theater, or at home" /></label><label>Notes <span className={styles.optional}>OPTIONAL</span><textarea maxLength={1000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Anything you want to remember" rows={3} /></label><div className={styles.formActions}><button type="button" onClick={() => setDraft(null)}>Cancel</button><button type="submit" className={styles.primary}> {editing ? "Save changes" : "Add title"} →</button></div></form></div></div>}
  </main>;
}
