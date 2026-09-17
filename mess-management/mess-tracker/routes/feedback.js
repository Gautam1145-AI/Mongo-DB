const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');

/**
 * ============================================================================
 * FEEDBACK COLLECTION DESIGN & VALIDATION:
 * 
 * The feedback collection stores student ratings and sentiment tags referencing
 * a specific `mealLogId`. Unlike `itemsServed`, student feedback is stored in a
 * separate relational-style collection because:
 * 1. High Cardinality & Unbounded Growth: A single meal can receive hundreds of student
 *    reviews. In MongoDB, embedding an unbounded array of reviews inside `mealLogs`
 *    would cause document bloat and exceed document size limits or time series constraints.
 * 2. Independent Lifecycle: Students submit reviews asynchronously long after the meal is
 *    logged by mess staff.
 * ============================================================================
 */

/**
 * POST /api/feedback
 * Records a student rating and optional comments/tags for a served meal.
 * 
 * Body parameters:
 *   - mealLogId (String | ObjectId, required): Valid ObjectId of the mealLog
 *   - rating (Number, required): Integer between 1 and 5
 *   - tags (Array of Strings, optional, default: [])
 *   - comment (String, optional, default: "")
 */
router.post('/', async (req, res) => {
  try {
    const { mealLogId, rating, tags, comment } = req.body;

    // Explicit validation: mealLogId is required and must be a valid 24-character hexadecimal ObjectId
    if (!mealLogId || typeof mealLogId !== 'string' || !ObjectId.isValid(mealLogId)) {
      return res.status(400).json({
        error: "Invalid or missing 'mealLogId'. Must be a valid 24-character hex ObjectId string."
      });
    }

    // Explicit validation: rating is required and must be an integer between 1 and 5
    if (rating === undefined || rating === null || typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        error: "Invalid or missing 'rating'. Must be an integer between 1 and 5."
      });
    }

    // Cast mealLogId to native MongoDB ObjectId
    const objectIdMealLog = new ObjectId(mealLogId);

    // Validate optional tags
    let sanitizedTags = [];
    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return res.status(400).json({
          error: "'tags' must be an array of strings."
        });
      }
      sanitizedTags = tags.map(t => String(t).trim().toLowerCase()).filter(t => t.length > 0);
    }

    // Validate optional comment
    const sanitizedComment = typeof comment === 'string' ? comment.trim() : '';

    const feedbackDoc = {
      mealLogId: objectIdMealLog,
      rating: rating,
      tags: sanitizedTags,
      comment: sanitizedComment,
      submittedAt: new Date()
    };

    const db = getDB();
    const result = await db.collection('feedback').insertOne(feedbackDoc);

    const insertedDoc = {
      _id: result.insertedId,
      ...feedbackDoc
    };

    return res.status(201).json(insertedDoc);
  } catch (err) {
    console.error('Error inserting feedback:', err);
    return res.status(500).json({ error: 'Internal server error while saving feedback.' });
  }
});

/**
 * GET /api/feedback
 * Optional helper endpoint to retrieve recent feedback entries (e.g. for testing/monitoring).
 */
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const feedbackList = await db.collection('feedback')
      .find({})
      .sort({ submittedAt: -1 })
      .limit(100)
      .toArray();

    return res.status(200).json(feedbackList);
  } catch (err) {
    console.error('Error fetching feedback:', err);
    return res.status(500).json({ error: 'Internal server error while retrieving feedback.' });
  }
});

module.exports = router;
