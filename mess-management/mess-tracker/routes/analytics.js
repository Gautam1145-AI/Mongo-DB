const express = require('express');
const router = express.Router();
const { getDB } = require('../db');

/**
 * ============================================================================
 * AGGREGATION & ANALYTICS PIPELINES
 * ============================================================================
 */

/**
 * GET /api/analytics/wastage-trend?timeframe=daily|weekly&days=N&weeks=N&mealType=all|breakfast|lunch|snacks|dinner
 * 
 * Aggregates wastage numbers either:
 * - Day-by-day (daily) over the last N days (default: 14 days)
 * - Calendar week-by-week (weekly) over the last N weeks (default: 10 weeks)
 * 
 * Supports filtering by mealType or analyzing all meals together.
 */
router.get('/wastage-trend', async (req, res) => {
  try {
    const timeframe = req.query.timeframe === 'weekly' ? 'weekly' : 'daily';
    const mealTypeParam = req.query.mealType ? req.query.mealType.trim().toLowerCase() : 'all';

    let matchStage = {};
    let cutoffDate = new Date();

    if (timeframe === 'weekly') {
      const weeksParam = parseInt(req.query.weeks, 10);
      const weeks = (!isNaN(weeksParam) && weeksParam > 0) ? weeksParam : 10;
      cutoffDate.setDate(cutoffDate.getDate() - (weeks * 7));
      matchStage.timestamp = { $gte: cutoffDate };
    } else {
      const daysParam = parseInt(req.query.days, 10);
      const days = (!isNaN(daysParam) && daysParam > 0) ? daysParam : 14;
      cutoffDate.setDate(cutoffDate.getDate() - days);
      matchStage.timestamp = { $gte: cutoffDate };
    }

    if (mealTypeParam && mealTypeParam !== 'all') {
      matchStage.mealType = mealTypeParam;
    }

    let groupStage = {};
    let projectStage = {};
    let sortStage = {};

    if (timeframe === 'weekly') {
      groupStage = {
        _id: {
          week: { $week: '$timestamp' },
          mealType: '$mealType'
        },
        avgWastageKg: { $avg: '$wastageKg' },
        totalWastageKg: { $sum: '$wastageKg' },
        logCount: { $sum: 1 }
      };
      projectStage = {
        _id: 0,
        week: '$_id.week',
        mealType: '$_id.mealType',
        avgWastageKg: { $round: ['$avgWastageKg', 2] },
        totalWastageKg: { $round: ['$totalWastageKg', 2] },
        logCount: 1
      };
      sortStage = { week: 1, mealType: 1 };
    } else {
      groupStage = {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          mealType: '$mealType'
        },
        avgWastageKg: { $avg: '$wastageKg' },
        totalWastageKg: { $sum: '$wastageKg' },
        logCount: { $sum: 1 }
      };
      projectStage = {
        _id: 0,
        date: '$_id.date',
        mealType: '$_id.mealType',
        avgWastageKg: { $round: ['$avgWastageKg', 2] },
        totalWastageKg: { $round: ['$totalWastageKg', 2] },
        logCount: 1
      };
      sortStage = { date: 1, mealType: 1 };
    }

    const pipeline = [
      { $match: matchStage },
      { $group: groupStage },
      { $project: projectStage },
      { $sort: sortStage }
    ];

    const db = getDB();
    const results = await db.collection('mealLogs').aggregate(pipeline).toArray();

    return res.status(200).json(results);
  } catch (err) {
    console.error('Error in wastage-trend analytics:', err);
    return res.status(500).json({ error: 'Internal server error while computing wastage trend.' });
  }
});

/**
 * GET /api/analytics/item-correlation
 * 
 * Computes correlation between meal types, food wastage, and student satisfaction ratings.
 * 
 * ============================================================================
 * CRITICAL MONGODB VERSION COMPATIBILITY NOTE:
 * 
 * Performing a `$lookup` where the target or source collection is a TIME SERIES 
 * collection requires MongoDB 6.0+ (and works most reliably in MongoDB 6.3+).
 * 
 * In earlier MongoDB versions (5.0 - 5.3), $lookup on time series collections was
 * either unsupported or had severe pipeline expression limitations.
 * 
 * FALLBACK IMPLEMENTATION (for older MongoDB versions < 6.0):
 * If running on an older server that throws an error like:
 * "PlanExecutor error during aggregation :: caused by :: $lookup into a time series collection is not supported",
 * the application can use a 2-step JavaScript join fallback:
 * 
 * ```javascript
 * // FALLBACK:
 * const meals = await db.collection('mealLogs').find({}).toArray();
 * const feedbackList = await db.collection('feedback').find({}).toArray();
 * 
 * // Build lookup map of feedback ratings keyed by mealLogId
 * const ratingsByMeal = {};
 * for (const fb of feedbackList) {
 *   const key = fb.mealLogId.toString();
 *   if (!ratingsByMeal[key]) ratingsByMeal[key] = [];
 *   ratingsByMeal[key].push(fb.rating);
 * }
 * 
 * // Accumulate metrics by mealType for meals having at least one feedback
 * const statsByType = {};
 * for (const meal of meals) {
 *   const ratings = ratingsByMeal[meal._id.toString()];
 *   if (ratings && ratings.length > 0) {
 *     const mealAvgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
 *     if (!statsByType[meal.mealType]) {
 *       statsByType[meal.mealType] = { totalWastage: 0, totalRating: 0, count: 0 };
 *     }
 *     statsByType[meal.mealType].totalWastage += meal.wastageKg;
 *     statsByType[meal.mealType].totalRating += mealAvgRating;
 *     statsByType[meal.mealType].count += 1;
 *   }
 * }
 * 
 * const fallbackResults = Object.keys(statsByType).map(type => ({
 *   mealType: type,
 *   avgWastageKg: Number((statsByType[type].totalWastage / statsByType[type].count).toFixed(2)),
 *   avgRating: Number((statsByType[type].totalRating / statsByType[type].count).toFixed(2)),
 *   mealsAnalyzed: statsByType[type].count
 * })).sort((a, b) => b.avgWastageKg - a.avgWastageKg);
 * return res.status(200).json(fallbackResults);
 * ```
 * ============================================================================
 */
router.get('/item-correlation', async (req, res) => {
  try {
    const db = getDB();

    const pipeline = [
      {
        // Join feedback documents referencing each mealLog's _id
        $lookup: {
          from: 'feedback',
          localField: '_id',
          foreignField: 'mealLogId',
          as: 'feedback'
        }
      },
      {
        // Filter to ONLY meals that have at least one feedback entry (handles zero-feedback safely)
        $match: {
          'feedback.0': { $exists: true }
        }
      },
      {
        // Calculate average rating per meal and preserve mealType and wastageKg
        $project: {
          mealType: 1,
          wastageKg: 1,
          avgRating: { $avg: '$feedback.rating' }
        }
      },
      {
        // Group by mealType across all reviewed meals
        $group: {
          _id: '$mealType',
          avgWastageKg: { $avg: '$wastageKg' },
          avgRating: { $avg: '$avgRating' },
          mealsAnalyzed: { $sum: 1 }
        }
      },
      {
        // Shape output fields cleanly
        $project: {
          _id: 0,
          mealType: '$_id',
          avgWastageKg: { $round: ['$avgWastageKg', 2] },
          avgRating: { $round: ['$avgRating', 2] },
          mealsAnalyzed: 1
        }
      },
      {
        // Sort by average wastage descending
        $sort: { avgWastageKg: -1 }
      }
    ];

    try {
      const results = await db.collection('mealLogs').aggregate(pipeline).toArray();
      return res.status(200).json(results);
    } catch (aggErr) {
      // Automatic fallback if MongoDB version does not support $lookup on time series
      console.warn("Native $lookup failed (possibly MongoDB < 6.0/6.3). Executing JS join fallback. Reason:", aggErr.message);
      
      const meals = await db.collection('mealLogs').find({}).toArray();
      const feedbackList = await db.collection('feedback').find({}).toArray();

      const ratingsByMeal = {};
      for (const fb of feedbackList) {
        if (!fb.mealLogId) continue;
        const key = fb.mealLogId.toString();
        if (!ratingsByMeal[key]) ratingsByMeal[key] = [];
        ratingsByMeal[key].push(fb.rating);
      }

      const statsByType = {};
      for (const meal of meals) {
        if (!meal._id) continue;
        const ratings = ratingsByMeal[meal._id.toString()];
        if (ratings && ratings.length > 0) {
          const mealAvgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
          if (!statsByType[meal.mealType]) {
            statsByType[meal.mealType] = { totalWastage: 0, totalRating: 0, count: 0 };
          }
          statsByType[meal.mealType].totalWastage += (meal.wastageKg || 0);
          statsByType[meal.mealType].totalRating += mealAvgRating;
          statsByType[meal.mealType].count += 1;
        }
      }

      const fallbackResults = Object.keys(statsByType).map(type => ({
        mealType: type,
        avgWastageKg: Number((statsByType[type].totalWastage / statsByType[type].count).toFixed(2)),
        avgRating: Number((statsByType[type].totalRating / statsByType[type].count).toFixed(2)),
        mealsAnalyzed: statsByType[type].count
      })).sort((a, b) => b.avgWastageKg - a.avgWastageKg);

      return res.status(200).json(fallbackResults);
    }
  } catch (err) {
    console.error('Error in item-correlation analytics:', err);
    return res.status(500).json({ error: 'Internal server error while computing item correlation.' });
  }
});

/**
 * GET /api/analytics/top-wasted-items
 * 
 * Deconstructs itemsServed arrays to rank dishes by total quantity served and occurrence.
 * 
 * Design reasoning:
 * - Uses `$unwind` on the embedded snapshot `itemsServed`.
 * - Groups by dish name to sum total served kilograms and count how many times it was prepared.
 * - Caps results at top 10 items for executive summary charts/tables.
 */
router.get('/top-wasted-items', async (req, res) => {
  try {
    const pipeline = [
      {
        // Unwind the embedded snapshot array of served items
        $unwind: '$itemsServed'
      },
      {
        // Group by dish name
        $group: {
          _id: '$itemsServed.name',
          totalQtyServedKg: { $sum: '$itemsServed.qtyServedKg' },
          timesServed: { $sum: 1 }
        }
      },
      {
        // Reshape output with clean naming and rounding
        $project: {
          _id: 0,
          itemName: '$_id',
          totalQtyServedKg: { $round: ['$totalQtyServedKg', 2] },
          timesServed: 1
        }
      },
      {
        // Sort descending by total quantity served
        $sort: { totalQtyServedKg: -1 }
      },
      {
        // Limit to top 10 dishes
        $limit: 10
      }
    ];

    const db = getDB();
    const results = await db.collection('mealLogs').aggregate(pipeline).toArray();

    return res.status(200).json(results);
  } catch (err) {
    console.error('Error in top-wasted-items analytics:', err);
    return res.status(500).json({ error: 'Internal server error while computing top wasted items.' });
  }
});

/**
 * GET /api/analytics/top-tags
 * 
 * Identifies the most common feedback tags submitted by students.
 * 
 * Design reasoning:
 * - Runs directly on the `feedback` collection.
 * - Unwinds the `tags` array (e.g. ['cold', 'too spicy']).
 * - Groups and counts occurrences to highlight recurring qualitative complaints or praise.
 */
router.get('/top-tags', async (req, res) => {
  try {
    const pipeline = [
      {
        // Unwind the tags array
        $unwind: '$tags'
      },
      {
        // Group by individual tag and count occurrences
        $group: {
          _id: '$tags',
          count: { $sum: 1 }
        }
      },
      {
        // Format output
        $project: {
          _id: 0,
          tag: '$_id',
          count: 1
        }
      },
      {
        // Rank by frequency descending
        $sort: { count: -1 }
      },
      {
        // Cap at top 10 tags
        $limit: 10
      }
    ];

    const db = getDB();
    const results = await db.collection('feedback').aggregate(pipeline).toArray();

    return res.status(200).json(results);
  } catch (err) {
    console.error('Error in top-tags analytics:', err);
    return res.status(500).json({ error: 'Internal server error while computing top tags.' });
  }
});

module.exports = router;
