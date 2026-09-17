const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { connectDB, getDB } = require('./db');
const mealLogsRouter = require('./routes/mealLogs');
const feedbackRouter = require('./routes/feedback');
const analyticsRouter = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files (dashboard.html, assets, styles)
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/meallogs', mealLogsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/analytics', analyticsRouter);

/**
 * GET /api/menu-items
 * Returns the master menu items catalog used specifically to populate
 * the staff entry dropdown when logging served dishes.
 */
app.get('/api/menu-items', async (req, res) => {
  try {
    const db = getDB();
    const items = await db.collection('menuItems').find({}).toArray();
    return res.status(200).json(items);
  } catch (err) {
    console.error('Error fetching menu items:', err);
    return res.status(500).json({ error: 'Failed to fetch menu items.' });
  }
});

// Root route redirecting to dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Initialize database and start HTTP server
async function startServer() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`Mess Tracker Server running at: http://localhost:${PORT}`);
      console.log(`Dashboard available at:        http://localhost:${PORT}/dashboard.html`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
