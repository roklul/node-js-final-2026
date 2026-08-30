const express = require('express');
const cors = require('cors');

const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const coachesAdminRoutes = require('./routes/coaches-admin');
const publicCoachRoutes = require('./routes/public');
const coursesRoutes = require('./routes/courses');
const bookingsRoutes = require('./routes/bookings');
const { pool } = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

// M0
app.get('/healthcheck', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'success' });
  } catch (e) {
    res.status(503).json({ status: 'failed', message: 'Database not ready' });
  }
});

// M1
app.use('/api', adminRoutes);

// M2
app.use('/api/users', authRoutes);

// M3
app.use('/api/admin/coaches', coachesAdminRoutes);

// M5 (before M4 so POST/DELETE /api/courses/:id hits bookings, not courses GET)
app.use('/api', bookingsRoutes);

// M4
app.use('/api/coaches', publicCoachRoutes);
app.use('/api/courses', coursesRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ status: 'failed', message: '無此路由' });
});

// Error handler
app.use((err, req, res, next) => {
  res.status(500).json({ status: 'failed', message: err.message });
});

module.exports = app;