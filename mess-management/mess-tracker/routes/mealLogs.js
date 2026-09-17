const express = require('express');
const router = express.Router();
const { getDB } = require('../db');

/**
 * ============================================================================
 * SCHEMA DESIGN REASONING:
 * 
 * Why is `itemsServed` embedded as a snapshot instead of referenced to `menuItems`?
 * 
 * In this mess management system, `itemsServed` is an array of embedded sub-documents
 * [ { name: "Paneer Curry", qtyServedKg: 15.5 }, ... ] within each `mealLog`.
 * 
 * REASONING:
 * 1. Snapshot Guarantee: The items served during a past meal reflect historical reality.
 *    If the master `menuItems` catalog is updated (e.g., renamed, recategorized, or deleted),
 *    past meal records must remain completely unchanged and auditable.
 * 2. High Co-locality / Single Read: In operational dashboards and wastage audits, 
 *    the wastage figure (`wastageKg`) is almost always queried directly alongside the dishes 
 *    and quantities served. Embedding eliminates expensive `$lookup` / multi-collection joins 
 *    on every meal record read.
 * 3. Atomic Updates: Adding or adjusting a meal entry with its served dishes happens in a 
 *    single atomic write.
 * ============================================================================
 */

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'snacks', 'dinner'];

/**
 * POST /api/meallogs
 * Logs a new meal event with items served and wastage recorded.
 * 
 * Body parameters:
 *   - mealType (String, required): "breakfast" | "lunch" | "snacks" | "dinner"
 *   - wastageKg (Number, required): >= 0
 *   - itemsServed (Array of { name: String, qtyServedKg: Number }, optional, default [])
 *   - timestamp (ISODate / String, optional, default: new Date())
 */
router.post('/', async (req, res) => {
  try {
    const { mealType, itemsServed, wastageKg, timestamp } = req.body;

    // Explicit validation: mealType is strictly required and must match domain values
    if (!mealType || typeof mealType !== 'string' || !VALID_MEAL_TYPES.includes(mealType.toLowerCase())) {
      return res.status(400).json({
        error: `Invalid or missing 'mealType'. Must be one of: ${VALID_MEAL_TYPES.join(', ')}`
      });
    }

    // Explicit validation: wastageKg is strictly required, must be numeric, and non-negative
    if (wastageKg === undefined || wastageKg === null || typeof wastageKg !== 'number' || isNaN(wastageKg) || wastageKg < 0) {
      return res.status(400).json({
        error: "Invalid or missing 'wastageKg'. Must be a number greater than or equal to 0."
      });
    }

    // Validate itemsServed structure if provided
    let sanitizedItemsServed = [];
    if (itemsServed !== undefined) {
      if (!Array.isArray(itemsServed)) {
        return res.status(400).json({
          error: "'itemsServed' must be an array of { name: String, qtyServedKg: Number }."
        });
      }
      for (const item of itemsServed) {
        if (!item.name || typeof item.name !== 'string' || typeof item.qtyServedKg !== 'number' || item.qtyServedKg < 0) {
          return res.status(400).json({
            error: "Each item in 'itemsServed' must have a non-empty 'name' (string) and 'qtyServedKg' >= 0 (number)."
          });
        }
        sanitizedItemsServed.push({
          name: item.name.trim(),
          qtyServedKg: Number(item.qtyServedKg)
        });
      }
    }

    // Default timestamp to now if not provided, or parse valid date
    let parsedTimestamp = new Date();
    if (timestamp) {
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) {
        return res.status(400).json({
          error: "Invalid 'timestamp' format. Must be a valid ISO Date or parseable date string."
        });
      }
      parsedTimestamp = d;
    }

    const docToInsert = {
      timestamp: parsedTimestamp,
      mealType: mealType.toLowerCase(),
      wastageKg: Number(wastageKg),
      itemsServed: sanitizedItemsServed
    };

    const db = getDB();
    const result = await db.collection('mealLogs').insertOne(docToInsert);

    // Return 201 Created and the newly inserted document
    const insertedDoc = {
      _id: result.insertedId,
      ...docToInsert
    };

    return res.status(201).json(insertedDoc);
  } catch (err) {
    console.error('Error creating mealLog:', err);
    return res.status(500).json({ error: 'Internal server error while inserting meal log.' });
  }
});

/**
 * GET /api/meallogs?from&to&mealType
 * Retrieves meal logs with optional date-range and meal-type filters.
 * 
 * Query parameters:
 *   - from: ISO date string (inclusive lower bound)
 *   - to: ISO date string (inclusive upper bound)
 *   - mealType: "breakfast" | "lunch" | "snacks" | "dinner"
 * 
 * Results are sorted descending by timestamp and capped at 500 records.
 */
router.get('/', async (req, res) => {
  try {
    const { from, to, mealType } = req.query;
    const query = {};

    // Timestamp range filtering
    if (from || to) {
      query.timestamp = {};
      if (from) {
        const fromDate = new Date(from);
        if (isNaN(fromDate.getTime())) {
          return res.status(400).json({ error: "Invalid 'from' date format." });
        }
        query.timestamp.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (isNaN(toDate.getTime())) {
          return res.status(400).json({ error: "Invalid 'to' date format." });
        }
        query.timestamp.$lte = toDate;
      }
    }

    // Filter by metaField mealType if specified
    if (mealType) {
      if (!VALID_MEAL_TYPES.includes(mealType.toLowerCase())) {
        return res.status(400).json({
          error: `Invalid 'mealType' filter. Allowed values: ${VALID_MEAL_TYPES.join(', ')}`
        });
      }
      query.mealType = mealType.toLowerCase();
    }

    const db = getDB();
    // Sort descending by timestamp, capped at 500 results for safe bounded memory consumption
    const mealLogs = await db.collection('mealLogs')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(500)
      .toArray();

    return res.status(200).json(mealLogs);
  } catch (err) {
    console.error('Error fetching mealLogs:', err);
    return res.status(500).json({ error: 'Internal server error while retrieving meal logs.' });
  }
});

module.exports = router;
