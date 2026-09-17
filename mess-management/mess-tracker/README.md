# Mess Menu, Feedback & Food-Wastage Tracker

A production-grade college mess management and food-wastage tracking application built using **Node.js**, **Express**, the native **MongoDB driver**, and **Chart.js**.

## Architectural & Schema Design Decisions

### 1. Why `mealLogs` Uses a MongoDB Time Series Collection
Mess operations generate sequential, timestamped logs for each served meal (breakfast, lunch, snacks, dinner). MongoDB time series collections are optimized for measurements over time.

`mealLogs` is configured with:
- `timeField`: `timestamp`
- `metaField`: `mealType`

### 2. Why `itemsServed` Is Embedded
Each meal log stores the served-item snapshot directly as embedded sub-documents, keeping historical meal records self-contained.

### 3. Why Feedback Is Separate
Student feedback is stored separately so ratings and sentiment can grow independently and remain queryable without bloating meal log documents.

## Project Structure

```text
mess-tracker/
├── server.js
├── db.js
├── seed.js
├── package.json
├── package-lock.json
├── routes/
│   ├── analytics.js
│   ├── feedback.js
│   └── mealLogs.js
└── public/
    └── dashboard.html
```

## Setup

1. Install Node.js and MongoDB.
2. Create a local `.env` file with your MongoDB connection settings.
3. Install dependencies:

```bash
npm install
```

4. Seed sample data:

```bash
npm run seed
```

5. Start the server:

```bash
npm start
```

Default port: `3000` unless `PORT` is set.

## Environment Variables

Use a local `.env` file for secrets; do not commit credentials.

```text
MONGODB_URI=<your-mongodb-connection-string>
DB_NAME=<your-database-name>
PORT=3000
```
