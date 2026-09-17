const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');

/**
 * Feedback is stored separately from meal logs so ratings and sentiment can
 * grow independently and remain easy to query.
 */

module.exports = router;
