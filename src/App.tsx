import { useEffect, useMemo, useState } from "react";
import { completeItem, createItem, fetchItems, fetchToday } from "./api";
import { formatShortDate, toDateKey } from "../shared/dates";
import type { CreateLifeItemInput, LifeItem, LifeItemType, TodayNudge, TodayResponse } from "../shared/types";

type View = "today" | "add" | "items";

const typeLabels: Record<LifeItemType, string> = {
  birthday: "Birthday",
  chore: "Chore",
  contact: "Contact",
  routine: "Routine",
  shopping: "Shopping"
};

const quickTemplates: Array<CreateLifeItemInput & { label: string }> = [
  {
    label: "Call someone",
    type: "contact",
    title: "Call Grandma",
    category: "People",
    cadenceDays: 30,
    contactName: "Grandma"
  },
  {
    label: "Clean a room",
    type: "chore",
    title: "Clean bathroom",
    category: "Home",
    cadenceDays: 7
  },
  {
    label: "Shopping trip",
    type: "shopping",
    title: "Go grocery shopping",
    category: "Shopping",
    cadenceDays: 7
  },
  {
    label: "Birthday gift",
    type: "birthday",
    title: "Buy birthday present",
    category: "Events",
    reminderLeadDays: 7
  }
];

export default function App() {
  const [view, setView] = useState<View>("today");
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [items, setItems] = useState<LifeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [todayResponse, itemResponse] = await Promise.all([fetchToday(), fetchItems()]);
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

      {!loading && view === "add" && <AddView onCreate={handleCreate} />}

      {!loading && view === "items" && <ItemsView items={items} />}
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

function AddView({ onCreate }: { onCreate: (input: CreateLifeItemInput) => void }) {
  const [draft, setDraft] = useState<CreateLifeItemInput>(quickTemplates[0]);

  function selectTemplate(template: CreateLifeItemInput) {
    setDraft({ ...template });
  }

  function update<K extends keyof CreateLifeItemInput>(key: K, value: CreateLifeItemInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="add-layout">
      <section className="template-strip">
        {quickTemplates.map((template) => (
          <button key={template.label} onClick={() => selectTemplate(template)}>
            {template.label}
          </button>
        ))}
      </section>

      <form
        className="editor-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(draft);
        }}
      >
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
          Save reminder
        </button>
      </form>
    </div>
  );
}

function ItemsView({ items }: { items: LifeItem[] }) {
  return (
    <section className="items-table">
      <div className="section-heading">
        <h2>All reminders</h2>
        <span>{items.length}</span>
      </div>
      {items.map((item) => (
        <article className="item-row" key={item.id}>
          <div>
            <p>{item.title}</p>
            <span>{typeLabels[item.type]} • {item.category}</span>
          </div>
          <span>{item.cadenceDays ? `Every ${item.cadenceDays} days` : item.dueDate ? formatShortDate(item.dueDate) : "Manual"}</span>
        </article>
      ))}
    </section>
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
