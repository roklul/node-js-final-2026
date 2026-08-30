const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/courses - in-progress courses only (start_at <= now < end_at)
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT co.*, u.name AS coach_name, s.name AS skill_name,
        (SELECT COUNT(*) FROM course_bookings cb WHERE cb.course_id = co.id AND cb.cancelled_at IS NULL)::int AS participant_count
      FROM courses co
      JOIN users u ON u.id = co.user_id
      LEFT JOIN skills s ON s.id = co.skill_id
      WHERE co.start_at <= NOW() AND co.end_at > NOW()
      ORDER BY co.start_at DESC
    `);
    res.json({ status: 'success', data: r.rows });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

module.exports = router;