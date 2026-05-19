# Raspberry Pi Daily Life Calendar Webapp

## Summary

Build a local-first touchscreen webapp for a Raspberry Pi, optimized for a 7-inch landscape kiosk display. The app will focus on daily life nudges rather than a traditional calendar: overdue relationship reminders, chores, grocery prompts, birthdays, and simple household routines.

The v1 will be standalone, Pi-only, touch-first, and backed by SQLite so it works offline and keeps household data durable.

## Key Changes

- Create a Vite + React + TypeScript frontend with a compact kiosk layout for 7-inch landscape screens.
- Add a small local Node API server with SQLite persistence.
- First screen: Today dashboard with prioritized nudges, today's agenda, overdue items, and quick completion controls.
- Add touch-friendly management flows for:
  - Contacts: name, relationship, last contacted date, contact cadence.
  - Chores: title, room/category, repeat cadence, last completed date.
  - Birthdays/events: person, date, reminder lead time.
  - Shopping/routines: recurring prompts such as groceries, errands, household supplies.
- Use explicit rule/template logic for v1:
  - "Call grandma every 30 days."
  - "Buy birthday present 7 days before birthday."
  - "Clean bathroom every 7 days."
  - "Go grocery shopping every week."
- No external calendar sync, login, remote access, or AI in v1.

## Interfaces And Data

- Local REST API only, consumed by the frontend:
  - `GET /api/today`
  - `GET /api/items`
  - `POST /api/items`
  - `PATCH /api/items/:id`
  - `POST /api/items/:id/complete`
  - `DELETE /api/items/:id`
- SQLite tables:
  - `items`: shared reminders/routines with type, title, category, cadence, due rules, status, and timestamps.
  - `contacts`: people used by relationship reminders and birthdays.
  - `completions`: history of completed chores/reminders.
- Frontend routes/views:
  - Today dashboard
  - Add reminder
  - Edit reminder
  - Contacts
  - Settings

## UX Direction

- Always-on dashboard should be calm, glanceable, and touchable from a few feet away.
- Use a direct checklist tone:
  - "Call Grandma."
  - "Clean bathroom."
  - "Buy Maya's birthday present."
- Group the home screen by urgency first:
  - Overdue
  - Today
  - Coming soon
  - Done today
- Use one-tap completion; tapping done records the completion and automatically calculates the next due date.
- Use large tap targets, clear status colors, and icon buttons where appropriate.
- Avoid a marketing-style landing page; the usable dashboard is the first screen.
- Include empty states and seeded sample data so the app feels alive immediately after setup.

## Test Plan

- Unit test reminder rule calculations:
  - overdue contact reminders
  - recurring chores
  - birthday lead-time reminders
  - completed item next-due behavior
- API tests for create, update, complete, delete, and today aggregation.
- Frontend smoke test that the Today dashboard renders seeded reminders.
- Run the app locally and verify the dashboard at a 7-inch landscape-like viewport.

## Assumptions

- The target device is a Raspberry Pi touchscreen in landscape orientation.
- The app only needs to run locally on the Pi for v1.
- SQLite is the source of truth.
- All household members share one dashboard and one set of reminders.
- External sync, voice input, mobile admin, authentication, and AI-generated prioritization are deferred.
