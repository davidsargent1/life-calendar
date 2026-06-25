import { useEffect, useMemo, useState } from "react";
import { archiveItem, completeItem, createItem, fetchItems, fetchToday, parseReminder, unarchiveItem, updateItem } from "./api";
import { formatShortDate, toDateKey } from "../shared/dates";
import { calculateDueDate } from "../shared/rules";
import type { CreateLifeItemInput, LifeItem, LifeItemType, TodayNudge, TodayResponse } from "../shared/types";

type View = "today" | "week" | "month" | "add" | "items";

const typeLabels: Record<LifeItemType, string> = {
  birthday: "Birthday",
  chore: "Chore",
  contact: "Contact",
  routine: "Routine",
  shopping: "Shopping"
};


export default function App() {
  const [view, setView] = useState<View>("today");
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [items, setItems] = useState<LifeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(_includeArchived = false) {
    setError(null);
    // Always fetch all items (including archived) so the Items view can
    // show the "Show archived" toggle when archived items exist.
    const [todayResponse, itemResponse] = await Promise.all([fetchToday(), fetchItems(true)]);
    setToday(todayResponse);
    setItems(itemResponse);
    setLoading(false);
  }

  useEffect(() => {
    load().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard");
      setLoading(false);
    });
  }, []);

  async function handleComplete(nudge: TodayNudge) {
    try {
      await completeItem(nudge.item.id, toDateKey(new Date()));
      await load();
    } catch (completeError: unknown) {
      setError(completeError instanceof Error ? completeError.message : "Failed to mark item done");
    }
  }

  async function handleCreate(input: CreateLifeItemInput) {
    try {
      await createItem(input);
      await load();
      setView("today");
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : "Failed to save reminder");
    }
  }

  return (
    <main className="app-shell">
      <Header activeView={view} onNavigate={setView} />

      {error && (
        <section className="notice" role="alert">
          {error}
        </section>
      )}

      {loading && <section className="notice">Loading household board...</section>}

      {!loading && view === "today" && today && (
        <TodayView today={today} onComplete={handleComplete} onAdd={() => setView("add")} />
      )}

      {!loading && view === "week" && <WeekView items={items} />}

      {!loading && view === "month" && <MonthView items={items} />}

      {!loading && view === "add" && <AddView onCreate={handleCreate} />}

      {!loading && view === "items" && (
        <ItemsView
          items={items}
          onReload={load}
          onError={setError}
        />
      )}
    </main>
  );
}

function Header({
  activeView,
  onNavigate
}: {
  activeView: View;
  onNavigate: (view: View) => void;
}) {
  const currentDate = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric"
      }),
    []
  );

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{currentDate}</p>
        <h1>Life Calendar</h1>
      </div>
      <nav className="nav-tabs" aria-label="Main navigation">
        <button className={activeView === "today" ? "active" : ""} onClick={() => onNavigate("today")}>
          Today
        </button>
        <button className={activeView === "week" ? "active" : ""} onClick={() => onNavigate("week")}>
          Week
        </button>
        <button className={activeView === "month" ? "active" : ""} onClick={() => onNavigate("month")}>
          Month
        </button>
        <button className={activeView === "add" ? "active" : ""} onClick={() => onNavigate("add")}>
          Add
        </button>
        <button className={activeView === "items" ? "active" : ""} onClick={() => onNavigate("items")}>
          Items
        </button>
      </nav>
    </header>
  );
}

function TodayView({
  today,
  onComplete,
  onAdd
}: {
  today: TodayResponse;
  onComplete: (nudge: TodayNudge) => void;
  onAdd: () => void;
}) {
  const totalOpen =
    today.sections.overdue.length + today.sections.today.length + today.sections.soon.length;

  return (
    <div className="today-layout">
      <section className="summary-band">
        <div>
          <p className="eyebrow">Household focus</p>
          <h2>{totalOpen === 0 ? "Nothing urgent." : `${totalOpen} things need attention.`}</h2>
        </div>
        <button className="primary-action" onClick={onAdd}>
          Add reminder
        </button>
      </section>

      <div className="nudge-grid">
        <NudgeSection title="Overdue" tone="overdue" nudges={today.sections.overdue} onComplete={onComplete} />
        <NudgeSection title="Today" tone="today" nudges={today.sections.today} onComplete={onComplete} />
        <NudgeSection title="Coming soon" tone="soon" nudges={today.sections.soon} onComplete={onComplete} />
        <NudgeSection title="Done today" tone="done" nudges={today.sections.done} onComplete={onComplete} />
      </div>
    </div>
  );
}

function NudgeSection({
  title,
  tone,
  nudges,
  onComplete
}: {
  title: string;
  tone: "overdue" | "today" | "soon" | "done";
  nudges: TodayNudge[];
  onComplete: (nudge: TodayNudge) => void;
}) {
  return (
    <section className={`nudge-section ${tone}`}>
      <div className="section-heading">
        <h3>{title}</h3>
        <span>{nudges.length}</span>
      </div>

      {nudges.length === 0 ? (
        <p className="empty-copy">Clear.</p>
      ) : (
        <div className="nudge-list">
          {nudges.map((nudge) => (
            <article className="nudge-card" key={nudge.item.id}>
              <div>
                <p className="nudge-message">{nudge.message}</p>
                <p className="meta-line">
                  {nudge.item.category}
                  {nudge.dueDate ? ` • ${dueLabel(nudge)}` : ""}
                </p>
              </div>
              {tone !== "done" && (
                <button className="done-button" onClick={() => onComplete(nudge)} aria-label={`Mark ${nudge.item.title} done`}>
                  Done
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const emptyDraft: CreateLifeItemInput = { type: "routine", title: "", category: "" };

function AddView({ onCreate }: { onCreate: (input: CreateLifeItemInput) => void }) {
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<CreateLifeItemInput | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const MAX_PROMPT = 500;
  const tooLong = prompt.length > MAX_PROMPT;

  async function handleParse(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || tooLong) return;
    setParsing(true);
    setParseError(null);
    try {
      const result = await parseReminder(prompt);
      setDraft(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not parse reminder");
    } finally {
      setParsing(false);
    }
  }

  if (draft === null) {
    return (
      <div className="add-layout">
        <form className="editor-panel editor-panel--single" onSubmit={handleParse}>
          <p className="eyebrow">Describe your reminder in plain English</p>
          <textarea
            autoFocus
            className="nl-input"
            disabled={parsing}
            placeholder="e.g. Call grandma every 30 days, or Buy birthday present for mom in March"
            rows={4}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <p className="char-count" style={{ color: tooLong ? "#c0392b" : undefined }}>
            {prompt.length} / {MAX_PROMPT}
          </p>
          {parseError && <p className="notice">{parseError}</p>}
          <div className="add-actions">
            <button className="primary-action" disabled={parsing || !prompt.trim() || tooLong} type="submit">
              {parsing ? "Thinking…" : "Create reminder"}
            </button>
            <button type="button" onClick={() => setDraft(emptyDraft)}>
              Fill in manually
            </button>
          </div>
        </form>
      </div>
    );
  }

  return <EditDraftView draft={draft} onBack={() => setDraft(null)} onCreate={onCreate} />;
}

function EditDraftView({
  draft: initialDraft,
  onBack,
  onCreate,
  saveLabel = "Save reminder"
}: {
  draft: CreateLifeItemInput;
  onBack: () => void;
  onCreate: (input: CreateLifeItemInput) => void;
  saveLabel?: string;
}) {
  const [draft, setDraft] = useState<CreateLifeItemInput>(initialDraft);

  function update<K extends keyof CreateLifeItemInput>(key: K, value: CreateLifeItemInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="add-layout">
      <form
        className="editor-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(draft);
        }}
      >
        <div className="add-actions">
          <button type="button" onClick={onBack}>
            ← Back
          </button>
        </div>

        <label>
          Type
          <select value={draft.type} onChange={(event) => update("type", event.target.value as LifeItemType)}>
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Reminder
          <input value={draft.title} onChange={(event) => update("title", event.target.value)} />
        </label>

        <label>
          Category
          <input value={draft.category ?? ""} onChange={(event) => update("category", event.target.value)} />
        </label>

        <label>
          Repeat every
          <div className="inline-field">
            <input
              min="1"
              type="number"
              value={draft.cadenceDays ?? ""}
              onChange={(event) => update("cadenceDays", event.target.value ? Number(event.target.value) : null)}
            />
            <span>days</span>
          </div>
        </label>

        <label>
          Due date
          <input value={draft.dueDate ?? ""} type="date" onChange={(event) => update("dueDate", event.target.value || null)} />
        </label>

        <label>
          Person
          <input value={draft.contactName ?? ""} onChange={(event) => update("contactName", event.target.value || null)} />
        </label>

        <div className="birthday-row">
          <label>
            Birthday month
            <input
              min="1"
              max="12"
              type="number"
              value={draft.birthdayMonth ?? ""}
              onChange={(event) => update("birthdayMonth", event.target.value ? Number(event.target.value) : null)}
            />
          </label>
          <label>
            Birthday day
            <input
              min="1"
              max="31"
              type="number"
              value={draft.birthdayDay ?? ""}
              onChange={(event) => update("birthdayDay", event.target.value ? Number(event.target.value) : null)}
            />
          </label>
          <label>
            Remind before
            <input
              min="0"
              type="number"
              value={draft.reminderLeadDays ?? ""}
              onChange={(event) => update("reminderLeadDays", event.target.value ? Number(event.target.value) : null)}
            />
          </label>
        </div>

        <button className="primary-action" type="submit">
          {saveLabel}
        </button>
      </form>
    </div>
  );
}

function ItemsView({
  items,
  onReload,
  onError
}: {
  items: LifeItem[];
  onReload: () => void;
  onError: (msg: string) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [editingItem, setEditingItem] = useState<LifeItem | null>(null);

  async function handleArchive(item: LifeItem) {
    try {
      if (item.archived) {
        await unarchiveItem(item.id);
      } else {
        await archiveItem(item.id);
      }
      onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update reminder");
    }
  }

  async function handleSaveEdit(input: CreateLifeItemInput) {
    if (!editingItem) return;
    try {
      await updateItem(editingItem.id, input);
      setEditingItem(null);
      onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save changes");
    }
  }

  function toggleArchived() {
    setShowArchived(next => !next);
  }

  const active = items.filter(i => !i.archived);
  const archived = items.filter(i => i.archived);
  const visible = showArchived ? items : active;

  if (editingItem) {
    const draft: CreateLifeItemInput = {
      type: editingItem.type,
      title: editingItem.title,
      category: editingItem.category,
      cadenceDays: editingItem.cadenceDays,
      dueDate: editingItem.dueDate,
      birthdayMonth: editingItem.birthdayMonth,
      birthdayDay: editingItem.birthdayDay,
      reminderLeadDays: editingItem.reminderLeadDays,
      contactName: editingItem.contactName
    };
    return (
      <EditDraftView
        draft={draft}
        onBack={() => setEditingItem(null)}
        onCreate={handleSaveEdit}
        saveLabel="Save changes"
      />
    );
  }

  return (
    <section className="items-table">
      <div className="section-heading">
        <h2>All reminders</h2>
        <div className="items-heading-right">
          <span>{active.length}{archived.length > 0 ? ` + ${archived.length} archived` : ""}</span>
          {archived.length > 0 && (
            <button className="toggle-archived" onClick={toggleArchived}>
              {showArchived ? "Hide archived" : "Show archived"}
            </button>
          )}
        </div>
      </div>
      {visible.map((item) => (
        <article className={`item-row${item.archived ? " archived" : ""}`} key={item.id}>
          <div>
            <p>{item.title}</p>
            <span>{typeLabels[item.type]} • {item.category}</span>
          </div>
          <span className="item-cadence">
            {item.cadenceDays ? `Every ${item.cadenceDays} days` : item.dueDate ? formatShortDate(item.dueDate) : "Manual"}
          </span>
          <div className="item-actions">
            {!item.archived && (
              <button onClick={() => setEditingItem(item)}>Edit</button>
            )}
            <button onClick={() => handleArchive(item)}>
              {item.archived ? "Unarchive" : "Archive"}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - ((dow + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function WeekView({ items }: { items: LifeItem[] }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const todayKey = toDateKey(new Date());
  const activeItems = useMemo(() => items.filter(i => !i.archived), [items]);

  // Due date per item computed once against today
  const dueDates = useMemo(() =>
    activeItems.map(item => ({ item, dueKey: calculateDueDate(item, todayKey) })),
    [activeItems, todayKey]
  );

  const monday = mondayOfWeek(new Date());
  monday.setDate(monday.getDate() + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toDateKey(d);
  });

  const weekStart = days[0];
  const weekEnd = days[6];
  const rangeLabel = `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}`;

  function itemsForDay(dayKey: string): LifeItem[] {
    return dueDates.filter(({ dueKey }) => dueKey === dayKey).map(({ item }) => item);
  }

  const overdueItems = weekOffset === 0
    ? dueDates.filter(({ dueKey }) => dueKey !== null && dueKey < todayKey).map(({ item }) => item)
    : [];

  return (
    <div className="cal-layout">
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={() => setWeekOffset(o => o - 1)}>← Prev</button>
        <span className="cal-range-label">{rangeLabel}</span>
        <button className="cal-nav-btn" onClick={() => setWeekOffset(o => o + 1)}>Next →</button>
        {weekOffset !== 0 && (
          <button className="cal-nav-btn cal-today-btn" onClick={() => setWeekOffset(0)}>Today</button>
        )}
      </div>

      {overdueItems.length > 0 && (
        <div className="cal-overdue-band">
          <span className="cal-overdue-label">Overdue</span>
          <div className="cal-overdue-items">
            {overdueItems.map(item => (
              <span key={item.id} className="cal-pill cal-pill--overdue">{item.title}</span>
            ))}
          </div>
        </div>
      )}

      <div className="week-grid">
        {days.map((dayKey, i) => {
          const dayItems = itemsForDay(dayKey);
          const isToday = dayKey === todayKey;
          return (
            <div key={dayKey} className={`week-col${isToday ? " week-col--today" : ""}`}>
              <div className="week-col-header">
                <span className="week-col-dayname">{DAY_NAMES[i]}</span>
                <span className={`week-col-date${isToday ? " week-col-date--today" : ""}`}>
                  {formatShortDate(dayKey)}
                </span>
              </div>
              <div className="week-col-items">
                {dayItems.length === 0
                  ? <p className="cal-empty">—</p>
                  : dayItems.map(item => (
                    <div key={item.id} className={`cal-pill cal-pill--${item.type}`}>{item.title}</div>
                  ))
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({ items }: { items: LifeItem[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const todayKey = toDateKey(now);

  const activeItems = useMemo(() => items.filter(i => !i.archived), [items]);

  const dueDates = useMemo(() =>
    activeItems.map(item => ({ item, dueKey: calculateDueDate(item, todayKey) })),
    [activeItems, todayKey]
  );

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  // Build calendar grid: weeks starting Monday
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const gridStart = new Date(firstOfMonth);
  // Rewind to Monday
  const firstDow = firstOfMonth.getUTCDay(); // 0=Sun
  gridStart.setUTCDate(gridStart.getUTCDate() - ((firstDow + 6) % 7));

  // 6 weeks × 7 days
  const grid: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(gridStart);
      cell.setUTCDate(gridStart.getUTCDate() + w * 7 + d);
      week.push(cell.toISOString().slice(0, 10));
    }
    grid.push(week);
  }

  // Drop last row if entirely outside current month
  const lastRow = grid[5];
  if (lastRow.every(k => Number(k.slice(5, 7)) - 1 !== month)) {
    grid.pop();
  }

  function itemsForDay(dayKey: string): LifeItem[] {
    return dueDates.filter(({ dueKey }) => dueKey === dayKey).map(({ item }) => item);
  }

  const overdueItems = dueDates
    .filter(({ dueKey }) => dueKey !== null && dueKey < todayKey)
    .map(({ item }) => item);

  return (
    <div className="cal-layout">
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={prevMonth}>← Prev</button>
        <span className="cal-range-label">{MONTH_NAMES[month]} {year}</span>
        <button className="cal-nav-btn" onClick={nextMonth}>Next →</button>
        {(year !== now.getFullYear() || month !== now.getMonth()) && (
          <button className="cal-nav-btn cal-today-btn" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}>
            Today
          </button>
        )}
      </div>

      {overdueItems.length > 0 && (
        <div className="cal-overdue-band">
          <span className="cal-overdue-label">Overdue</span>
          <div className="cal-overdue-items">
            {overdueItems.map(item => (
              <span key={item.id} className="cal-pill cal-pill--overdue">{item.title}</span>
            ))}
          </div>
        </div>
      )}

      <div className="month-grid">
        {DAY_NAMES.map(name => (
          <div key={name} className="month-col-header">{name}</div>
        ))}
        {grid.flat().map(dayKey => {
          const inMonth = Number(dayKey.slice(5, 7)) - 1 === month;
          const isToday = dayKey === todayKey;
          const dayItems = itemsForDay(dayKey);
          const dayNum = Number(dayKey.slice(8));
          return (
            <div
              key={dayKey}
              className={[
                "month-cell",
                inMonth ? "" : "month-cell--out",
                isToday ? "month-cell--today" : ""
              ].filter(Boolean).join(" ")}
            >
              <span className={`month-cell-num${isToday ? " month-cell-num--today" : ""}`}>{dayNum}</span>
              <div className="month-cell-items">
                {dayItems.map(item => (
                  <div key={item.id} className={`cal-pill cal-pill--${item.type}`}>{item.title}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function dueLabel(nudge: TodayNudge): string {
  if (!nudge.dueDate || nudge.daysUntilDue === null) {
    return "";
  }

  if (nudge.urgency === "done") {
    return `next ${formatShortDate(nudge.dueDate)}`;
  }

  if (nudge.daysUntilDue < 0) {
    const days = Math.abs(nudge.daysUntilDue);
    return `${days} day${days === 1 ? "" : "s"} overdue`;
  }

  if (nudge.daysUntilDue === 0) {
    return "due today";
  }

  return `${formatShortDate(nudge.dueDate)}`;
}
