# Mess Menu, Feedback & Food-Wastage Tracker

A production-grade college mess management and food-wastage tracking application built using **Node.js**, **Express**, the native **MongoDB driver**, and **Chart.js**.

## Architectural & Schema Design Decisions

### 1. Why `mealLogs` Uses a MongoDB Time Series Collection
Mess operations generate sequential, timestamped logs for each served meal (breakfast, lunch, snacks, dinner). In MongoDB, time series collections are optimized for sequences of measurements over time.

See `mess-tracker/README.md` for detailed schema, aggregation, API, setup, and usage documentation.

## Workspace

- `mess-tracker/` — Node.js/Express backend and dashboard
- Keep `.env` local and untracked; use environment variables for secrets.

## Run

```bash
npm run install:all
npm start
```

The server runs on the port configured by `PORT` (default `3000`).
