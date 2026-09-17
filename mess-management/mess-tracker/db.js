const { MongoClient } = require('mongodb');
require('dotenv').config();

/**
 * ============================================================================
 * DATABASE DESIGN REASONING:
 * 
 * Why is `mealLogs` a TIME SERIES collection?
 * In MongoDB, time series collections (introduced in v5.0) are specifically 
 * optimized to store sequences of measurements over time. 
 * 
 * `mealLogs` is configured with:
 *   - timeField: "timestamp"
 *   - metaField: "mealType" ("breakfast" | "lunch" | "snacks" | "dinner")
 *   - granularity: "hours"
 * 
 * REASONING:
 * 1. Insert-heavy: Mess operations log meal data sequentially multiple times a day.
 * 2. Timestamped: Every single record is strictly tied to the date/time the meal was served.
 * 3. Query patterns: Queries and aggregations are almost exclusively time-range-based
 *    (e.g., weekly trends, monthly wastage, filtering between dates).
 * 
 * Under the hood, MongoDB stores time series data in columnar, compressed bucket
 * documents, which dramatically reduces storage footprint and disk I/O, providing
 * much faster scan and aggregation performance for range queries.
 * ============================================================================
 */

let dbInstance = null;
let clientInstance = null;

/**
 * Connect to MongoDB and ensure required collections & indexes exist.
 */
async function connectDB() {
  if (dbInstance) {
    return dbInstance;
  }

  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.DB_NAME || 'mess_tracker';

  clientInstance = new MongoClient(uri);
  await clientInstance.connect();
  dbInstance = clientInstance.db(dbName);

  // Check if mealLogs collection already exists
  const collections = await dbInstance.listCollections({ name: 'mealLogs' }).toArray();
  if (collections.length === 0) {
    // Create mealLogs as a time series collection
    await dbInstance.createCollection('mealLogs', {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'mealType',
        granularity: 'hours'
      }
    });
    console.log("Created 'mealLogs' as a time series collection (timeField: timestamp, metaField: mealType, granularity: hours).");
  }

  // Ensure indexes specified in requirements
  await ensureIndexes(dbInstance);

  return dbInstance;
}

/**
 * Ensure specified indexes exist on collections
 */
async function ensureIndexes(db) {
  try {
    // Index on mealType metaField in mealLogs
    await db.collection('mealLogs').createIndex({ mealType: 1 });

    // Indexes on feedback collection for foreign key lookup and date sorting
    await db.collection('feedback').createIndex({ mealLogId: 1 });
    await db.collection('feedback').createIndex({ submittedAt: -1 });
  } catch (err) {
    // Ignore index creation error if already in progress or exists
    console.warn("Index creation notice:", err.message);
  }
}

/**
 * Return singleton database instance
 */
function getDB() {
  if (!dbInstance) {
    throw new Error('Database not initialized! Call connectDB() before getDB().');
  }
  return dbInstance;
}

/**
 * Close database connection
 */
async function closeDB() {
  if (clientInstance) {
    await clientInstance.close();
    dbInstance = null;
    clientInstance = null;
  }
}

module.exports = {
  connectDB,
  getDB,
  closeDB,
  ensureIndexes
};
