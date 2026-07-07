import { useEffect, useMemo, useState } from "react";
import { archiveItem, completeItem, createItem, fetchItems, fetchToday, parseReminder, unarchiveItem, updateItem } from "./api";
import { buildMonthGrid, formatShortDate, mondayOfWeek, parseDateKey, toDateKey } from "../shared/dates";
import { DEFAULT_CATEGORY, PRESET_CATEGORIES, isBirthdayCategory, isPeopleCategory, isPresetCategory } from "../shared/categories";
import { itemOccurrences } from "../shared/rules";
import { applicablePayload, draftForDay, initialRepeatMode, itemToDraft, type RepeatMode } from "./reminderDraft";
import type { CreateLifeItemInput, LifeItem, TodayNudge, TodayResponse } from "../shared/types";

const CUSTOM_CATEGORY = "__custom__";

type View = "today" | "week" | "month" | "add" | "items";

// Map an arbitrary category string to a stable hue (0-359) so each
// category gets a consistent colour without a hard-coded palette.
function categoryHue(category: string): number {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // keep in 32-bit range
  }
  return Math.abs(hash) % 360;
}

function categoryPillStyle(category: string): React.CSSProperties {
  const hue = categoryHue(category);
  return { background: `hsl(${hue} 58% 87%)`, color: `hsl(${hue} 48% 26%)` };
}

function categoryDotStyle(category: string): React.CSSProperties {
  return { background: `hsl(${categoryHue(category)} 55% 58%)` };
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHLY_WEEK_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "First" },
  { value: 2, label: "Second" },
  { value: 3, label: "Third" },
  { value: 4, label: "Fourth" },
  { value: -1, label: "Last" }
];

// Human label for an item's schedule, e.g. "3rd Thursday", "Every 7 days".
function scheduleLabel(item: LifeItem): string {
  if (isBirthdayCategory(item.category) && item.birthdayMonth && item.birthdayDay) {
    return `Birthday ${item.birthdayMonth}/${item.birthdayDay}`;
  }
  if (item.monthlyWeek != null && item.monthlyWeekday != null) {
    const ordinal = MONTHLY_WEEK_OPTIONS.find((o) => o.value === item.monthlyWeek)?.label ?? `${item.monthlyWeek}`;
    return `${ordinal} ${WEEKDAY_NAMES[item.monthlyWeekday] ?? ""}`.trim();
  }
  if (item.weeklyDay != null) return `Weekly on ${WEEKDAY_NAMES[item.weeklyDay] ?? ""}`.trim();
  if (item.cadenceDays) return `Every ${item.cadenceDays} days`;
  if (item.dueDate) return formatShortDate(item.dueDate);
  return "Manual";
}


export default function App() {
  const [view, setView] = useState<View>("today");
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [items, setItems] = useState<LifeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A draft to seed the Add view with (e.g. when a calendar day is clicked).
  const [addDraft, setAddDraft] = useState<CreateLifeItemInput | null>(null);
  // Categories hidden from the calendar views. Shared across Week and Month
  // so the filter persists when switching between them. Opt-out: empty = all
  // shown, so newly added categories appear by default.
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => new Set());

  // Navigate via the tabs/buttons; clears any seeded Add draft so a plain
  // "Add" starts blank. The day-click path sets a draft and switches directly.
  function goToView(next: View) {
    setAddDraft(null);
    setView(next);
  }

  function handleAddOnDay(dayKey: string) {
    setAddDraft(draftForDay(dayKey));
    setView("add");
  }

  function toggleCategory(category: string) {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function showAllCategories() {
    setHiddenCategories(new Set());
  }

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
      setAddDraft(null);
      setView("today");
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : "Failed to save reminder");
    }
  }

  return (
    <main className="app-shell">
      <Header activeView={view} onNavigate={goToView} />

      {error && (
        <section className="notice" role="alert">
          {error}
        </section>
      )}

      {loading && <section className="notice">Loading household board...</section>}

      {!loading && view === "today" && today && (
        <TodayView today={today} onComplete={handleComplete} onAdd={() => goToView("add")} />
      )}

      {!loading && view === "week" && (
        <WeekView
          items={items}
          hiddenCategories={hiddenCategories}
          onToggleCategory={toggleCategory}
          onShowAll={showAllCategories}
          onDayClick={handleAddOnDay}
        />
      )}

      {!loading && view === "month" && (
        <MonthView
          items={items}
          hiddenCategories={hiddenCategories}
          onToggleCategory={toggleCategory}
          onShowAll={showAllCategories}
          onDayClick={handleAddOnDay}
        />
      )}

      {!loading && view === "add" && (
        <AddView key={addDraft ? "seeded" : "blank"} onCreate={handleCreate} initialDraft={addDraft} />
      )}

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
            <article className="nudge-card" key={nudge.key}>
              <div>
                <p className="nudge-message">{nudge.message}</p>
                <p className="meta-line">
                  <span className="cat-dot" style={categoryDotStyle(nudge.item.category)} />
                  {nudge.item.category}
                  {nudge.dueDate ? ` • ${dueLabel(nudge)}` : ""}
                </p>
              </div>
              {tone !== "done" && nudge.kind !== "lead" && (
                <button className="done-button" onClick={() => onComplete(nudge)} aria-label={`Mark ${nudge.title} done`}>
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

const emptyDraft: CreateLifeItemInput = { title: "", category: DEFAULT_CATEGORY };

function AddView({
  onCreate,
  initialDraft
}: {
  onCreate: (input: CreateLifeItemInput) => void;
  initialDraft?: CreateLifeItemInput | null;
}) {
  const [prompt, setPrompt] = useState("");
  // Seeded (e.g. from a clicked calendar day) → skip straight to the form.
  const [draft, setDraft] = useState<CreateLifeItemInput | null>(initialDraft ?? null);
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
  const [useCustomCategory, setUseCustomCategory] = useState(() =>
    initialDraft.category ? !isPresetCategory(initialDraft.category) : false
  );
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => initialRepeatMode(initialDraft));

  function update<K extends keyof CreateLifeItemInput>(key: K, value: CreateLifeItemInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  // Switching repeat mode clears the other modes' fields so only one
  // scheduling mechanism is ever active (and applicablePayload sends nulls
  // for the rest).
  function changeRepeatMode(mode: RepeatMode) {
    setRepeatMode(mode);
    setDraft((current) => ({
      ...current,
      cadenceDays: mode === "interval" ? current.cadenceDays ?? null : null,
      dueDate: mode === "oneoff" ? current.dueDate ?? null : null,
      monthlyWeek: mode === "monthly" ? current.monthlyWeek ?? 1 : null,
      monthlyWeekday: mode === "monthly" ? current.monthlyWeekday ?? 1 : null,
      weeklyDay: mode === "weekly" ? current.weeklyDay ?? 1 : null
    }));
  }

  // Only show the fields that apply to the chosen category.
  const isBirthday = isBirthdayCategory(draft.category);
  const showPerson = isBirthday || isPeopleCategory(draft.category);

  return (
    <div className="add-layout">
      <form
        className="editor-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(applicablePayload(draft));
        }}
      >
        <div className="editor-back-row">
          <button type="button" className="editor-back" onClick={onBack}>
            ← Back
          </button>
        </div>

        <label>
          Reminder
          <input value={draft.title} onChange={(event) => update("title", event.target.value)} />
        </label>

        <label>
          Category
          <select
            value={useCustomCategory ? CUSTOM_CATEGORY : (draft.category ?? "")}
            onChange={(event) => {
              const value = event.target.value;
              if (value === CUSTOM_CATEGORY) {
                setUseCustomCategory(true);
                update("category", "");
              } else {
                setUseCustomCategory(false);
                update("category", value);
              }
            }}
          >
            {PRESET_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
            <option value={CUSTOM_CATEGORY}>Other…</option>
          </select>
        </label>

        {useCustomCategory && (
          <label>
            Custom category
            <input
              autoFocus
              placeholder="e.g. Garden"
              value={draft.category ?? ""}
              onChange={(event) => update("category", event.target.value)}
            />
          </label>
        )}

        {!isBirthday && (
          <label>
            Repeats
            <select value={repeatMode} onChange={(event) => changeRepeatMode(event.target.value as RepeatMode)}>
              <option value="interval">Every N days</option>
              <option value="weekly">Weekly (day of week)</option>
              <option value="monthly">Monthly (day of week)</option>
              <option value="oneoff">One-off date</option>
            </select>
          </label>
        )}

        {!isBirthday && repeatMode === "interval" && (
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
        )}

        {!isBirthday && repeatMode === "weekly" && (
          <label>
            Every
            <select
              value={draft.weeklyDay ?? 1}
              onChange={(event) => update("weeklyDay", Number(event.target.value))}
            >
              {WEEKDAY_NAMES.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}

        {!isBirthday && repeatMode === "monthly" && (
          <label>
            On the
            <div className="monthly-fields">
              <select
                value={draft.monthlyWeek ?? 1}
                onChange={(event) => update("monthlyWeek", Number(event.target.value))}
              >
                {MONTHLY_WEEK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={draft.monthlyWeekday ?? 1}
                onChange={(event) => update("monthlyWeekday", Number(event.target.value))}
              >
                {WEEKDAY_NAMES.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </label>
        )}

        {!isBirthday && repeatMode === "oneoff" && (
          <label>
            Due date
            <input value={draft.dueDate ?? ""} type="date" onChange={(event) => update("dueDate", event.target.value || null)} />
          </label>
        )}

        {showPerson && (
          <label>
            Person
            <input value={draft.contactName ?? ""} onChange={(event) => update("contactName", event.target.value || null)} />
          </label>
        )}

        {isBirthday && (
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
        )}

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
    return (
      <EditDraftView
        draft={itemToDraft(editingItem)}
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
            <span>
              <span className="cat-dot" style={categoryDotStyle(item.category)} />
              {item.category}
            </span>
          </div>
          <span className="item-cadence">
            {scheduleLabel(item)}
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

type CalendarViewProps = {
  items: LifeItem[];
  hiddenCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  onShowAll: () => void;
  onDayClick: (dayKey: string) => void;
};

function weekdayName(dayKey: string): string {
  return WEEKDAY_NAMES[parseDateKey(dayKey).getUTCDay()] ?? "";
}

function activateOnKey(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

// Interactive legend + filter: lists every category the user has (so hidden
// ones stay reachable) and toggles them in/out of the calendar on click.
function CategoryFilter({
  items,
  hiddenCategories,
  onToggleCategory,
  onShowAll
}: Omit<CalendarViewProps, "onDayClick">) {
  const categories = useMemo(() => {
    const seen = new Set(items.filter(i => !i.archived).map(i => i.category).filter(Boolean));
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [items]);

  if (categories.length === 0) return null;

  // Base this on the hidden set itself, not the visible category list, so the
  // reset stays reachable even if a hidden category's items were all archived.
  const anyHidden = hiddenCategories.size > 0;

  return (
    <div className="cal-filter">
      <span className="cal-filter-label">Filter</span>
      <div className="cal-filter-chips">
        {categories.map(category => {
          const off = hiddenCategories.has(category);
          return (
            <button
              key={category}
              type="button"
              aria-pressed={!off}
              className={`cal-filter-chip${off ? " cal-filter-chip--off" : ""}`}
              onClick={() => onToggleCategory(category)}
            >
              <span className="cat-dot" style={categoryDotStyle(category)} />
              {category}
            </button>
          );
        })}
      </div>
      {anyHidden && (
        <button type="button" className="cal-filter-reset" onClick={onShowAll}>
          Show all
        </button>
      )}
    </div>
  );
}

function WeekView({ items, hiddenCategories, onToggleCategory, onShowAll, onDayClick }: CalendarViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const todayKey = toDateKey(new Date());
  const activeItems = useMemo(
    () => items.filter(i => !i.archived && !hiddenCategories.has(i.category)),
    [items, hiddenCategories]
  );

  // Occurrences per item computed once against today. A birthday's "remind
  // before" lead expands into a second occurrence, so one item can appear on
  // two days (the birthday and the lead reminder).
  const occurrences = useMemo(() =>
    activeItems.flatMap(item => itemOccurrences(item, todayKey)),
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

  function itemsForDay(dayKey: string) {
    return occurrences.filter(occ => occ.dueDate === dayKey);
  }

  const overdueItems = weekOffset === 0
    ? occurrences.filter(occ => occ.kind !== "lead" && occ.dueDate !== null && occ.dueDate < todayKey)
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
            {overdueItems.map(occ => (
              <span key={`${occ.item.id}:${occ.kind}`} className="cal-pill" style={categoryPillStyle(occ.item.category)}>{occ.title}</span>
            ))}
          </div>
        </div>
      )}

      <CategoryFilter
        items={items}
        hiddenCategories={hiddenCategories}
        onToggleCategory={onToggleCategory}
        onShowAll={onShowAll}
      />

      <div className="week-grid">
        {days.map((dayKey, i) => {
          const dayItems = itemsForDay(dayKey);
          const isToday = dayKey === todayKey;
          return (
            <div
              key={dayKey}
              className={`week-col cal-clickable${isToday ? " week-col--today" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`Add a weekly reminder on ${weekdayName(dayKey)}`}
              onClick={() => onDayClick(dayKey)}
              onKeyDown={(event) => activateOnKey(event, () => onDayClick(dayKey))}
              title={`Add a weekly reminder on ${weekdayName(dayKey)}`}
            >
              <span className="cal-add-hint" aria-hidden="true">＋</span>
              <div className="week-col-header">
                <span className="week-col-dayname">{DAY_NAMES[i]}</span>
                <span className={`week-col-date${isToday ? " week-col-date--today" : ""}`}>
                  {formatShortDate(dayKey)}
                </span>
              </div>
              <div className="week-col-items">
                {dayItems.length === 0
                  ? <p className="cal-empty">—</p>
                  : dayItems.map(occ => (
                    <div key={`${occ.item.id}:${occ.kind}`} className="cal-pill" style={categoryPillStyle(occ.item.category)} onClick={(event) => event.stopPropagation()}>{occ.title}</div>
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

function MonthView({ items, hiddenCategories, onToggleCategory, onShowAll, onDayClick }: CalendarViewProps) {
  const todayKey = toDateKey(new Date());
  const todayYear = Number(todayKey.slice(0, 4));
  const todayMonth = Number(todayKey.slice(5, 7)) - 1; // 0-indexed
  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);

  const activeItems = useMemo(
    () => items.filter(i => !i.archived && !hiddenCategories.has(i.category)),
    [items, hiddenCategories]
  );

  const occurrences = useMemo(() =>
    activeItems.flatMap(item => itemOccurrences(item, todayKey)),
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

  const grid = buildMonthGrid(year, month);

  function itemsForDay(dayKey: string) {
    return occurrences.filter(occ => occ.dueDate === dayKey);
  }

  const isCurrentMonth = year === todayYear && month === todayMonth;
  const overdueItems = isCurrentMonth
    ? occurrences.filter(occ => occ.kind !== "lead" && occ.dueDate !== null && occ.dueDate < todayKey)
    : [];

  return (
    <div className="cal-layout">
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={prevMonth}>← Prev</button>
        <span className="cal-range-label">{MONTH_NAMES[month]} {year}</span>
        <button className="cal-nav-btn" onClick={nextMonth}>Next →</button>
        {!isCurrentMonth && (
          <button className="cal-nav-btn cal-today-btn" onClick={() => {
            const now = new Date();
            setYear(now.getFullYear());
            setMonth(now.getMonth());
          }}>
            Today
          </button>
        )}
      </div>

      {overdueItems.length > 0 && (
        <div className="cal-overdue-band">
          <span className="cal-overdue-label">Overdue</span>
          <div className="cal-overdue-items">
            {overdueItems.map(occ => (
              <span key={`${occ.item.id}:${occ.kind}`} className="cal-pill" style={categoryPillStyle(occ.item.category)}>{occ.title}</span>
            ))}
          </div>
        </div>
      )}

      <CategoryFilter
        items={items}
        hiddenCategories={hiddenCategories}
        onToggleCategory={onToggleCategory}
        onShowAll={onShowAll}
      />

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
                "month-cell cal-clickable",
                inMonth ? "" : "month-cell--out",
                isToday ? "month-cell--today" : ""
              ].filter(Boolean).join(" ")}
              role="button"
              tabIndex={0}
              aria-label={`Add a weekly reminder on ${weekdayName(dayKey)}`}
              onClick={() => onDayClick(dayKey)}
              onKeyDown={(event) => activateOnKey(event, () => onDayClick(dayKey))}
              title={`Add a weekly reminder on ${weekdayName(dayKey)}`}
            >
              <span className="cal-add-hint" aria-hidden="true">＋</span>
              <span className={`month-cell-num${isToday ? " month-cell-num--today" : ""}`}>{dayNum}</span>
              <div className="month-cell-items">
                {dayItems.map(occ => (
                  <div key={`${occ.item.id}:${occ.kind}`} className="cal-pill" style={categoryPillStyle(occ.item.category)} onClick={(event) => event.stopPropagation()}>{occ.title}</div>
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
