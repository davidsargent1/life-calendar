# Life Calendar

A local-first household calendar for a Raspberry Pi touchscreen. It focuses on daily life reminders: calling people, buying birthday presents, groceries, chores, and recurring routines.

## Development

```bash
npm install
npm run dev
```

The dev app runs with:

- Frontend: `http://localhost:5173` or the next available Vite port
- API: `http://127.0.0.1:8787`
- SQLite data: `data/life-calendar.sqlite`

## Checks

```bash
npm test
npm run build
```

## Workflow

Use feature branches for code work, open a pull request before merging to `main`, and run `ras` on code PRs before merge.
