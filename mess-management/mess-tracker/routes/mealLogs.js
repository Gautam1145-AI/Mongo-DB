const express = require('express');
const router = express.Router();
const { getDB } = require('../db');

/**
 * SCHEMA DESIGN REASONING:
 * `itemsServed` is embedded as a snapshot within each mealLog document so the
 * historical meal record remains self-contained.
 */

module.exports = router;
