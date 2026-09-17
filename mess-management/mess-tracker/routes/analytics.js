const express = require('express');
const router = express.Router();
const { getDB } = require('../db');

/**
 * Analytics endpoints use MongoDB aggregation pipelines for wastage trends,
 * feedback summaries, and meal-level reporting.
 */

module.exports = router;
