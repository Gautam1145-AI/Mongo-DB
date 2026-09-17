const { MongoClient } = require('mongodb');
require('dotenv').config();

/**
 * DATABASE DESIGN REASONING:
 * Why is `mealLogs` a TIME SERIES collection?
 * Time series collections are optimized for sequences of measurements over time.
 */

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'mess_management';

let client;
let db;

async function connectDB() {
  if (db) return db;
  if (!uri) throw new Error('MONGODB_URI is not configured');
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  return db;
}

function getDB() {
  if (!db) throw new Error('Database not connected. Call connectDB() first.');
  return db;
}

module.exports = { connectDB, getDB };
