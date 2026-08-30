const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { verifyToken } = require('../middlewares/auth');

// POST /api/credit-package/:id - buy a package
router.post('/credit-package/:id', verifyToken, async (req, res) => {
  try {
    const pkg = (await pool.query('SELECT * FROM credit_packages WHERE id = $1', [req.params.id])).rows[0];
    if (!pkg) return res.status(400).json({ status: 'failed', message: '找不到該方案' });

    const r = await pool.query(
      'INSERT INTO credit_purchases (user_id, credit_package_id) VALUES ($1, $2) RETURNING *',
      [req.user.id, req.params.id]
    );
    res.status(201).json({ status: 'success', data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// POST /api/courses/:id - book a course
router.post('/courses/:id', verifyToken, async (req, res) => {
  try {
    const course = (await pool.query('SELECT * FROM courses WHERE id = $1', [req.params.id])).rows[0];
    if (!course) return res.status(400).json({ status: 'failed', message: '課程不存在' });

    const existing = (await pool.query(
      'SELECT * FROM course_bookings WHERE user_id = $1 AND course_id = $2',
      [req.user.id, req.params.id]
    )).rows[0];
    if (existing) return res.status(400).json({ status: 'failed', message: '已經報名過此課程' });

    const purchased = (await pool.query(
      'SELECT COALESCE(SUM(pkg.credit_amount), 0)::int AS total FROM credit_purchases cp JOIN credit_packages pkg ON pkg.id = cp.credit_package_id WHERE cp.user_id = $1',
      [req.user.id]
    )).rows[0].total;
    const used = (await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM course_bookings WHERE user_id = $1 AND cancelled_at IS NULL',
      [req.user.id]
    )).rows[0].cnt;
    if (purchased - used <= 0) return res.status(400).json({ status: 'failed', message: '已無可使用堂數' });

    const currentCount = (await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM course_bookings WHERE course_id = $1 AND cancelled_at IS NULL',
      [req.params.id]
    )).rows[0].cnt;
    if (currentCount >= course.max_participants) return res.status(400).json({ status: 'failed', message: '已達最大參加人數，無法參加' });

    const r = await pool.query(
      'INSERT INTO course_bookings (user_id, course_id) VALUES ($1, $2) RETURNING *',
      [req.user.id, req.params.id]
    );
    const newRemain = purchased - used - 1;
    res.status(201).json({ status: 'success', data: { ...r.rows[0], credit_remain: newRemain } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// DELETE /api/courses/:id - cancel booking
router.delete('/courses/:id', verifyToken, async (req, res) => {
  try {
    const booking = (await pool.query(
      'SELECT * FROM course_bookings WHERE user_id = $1 AND course_id = $2 AND cancelled_at IS NULL',
      [req.user.id, req.params.id]
    )).rows[0];
    if (!booking) return res.status(400).json({ status: 'failed', message: '找不到該報名紀錄' });

    const r = await pool.query(
      'UPDATE course_bookings SET cancelled_at = NOW() WHERE id = $1 RETURNING *',
      [booking.id]
    );

    const purch = (await pool.query(
      'SELECT COALESCE(SUM(pkg.credit_amount), 0)::int AS total FROM credit_purchases cp JOIN credit_packages pkg ON pkg.id = cp.credit_package_id WHERE cp.user_id = $1',
      [req.user.id]
    )).rows[0].total;
    const usedAfter = (await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM course_bookings WHERE user_id = $1 AND cancelled_at IS NULL',
      [req.user.id]
    )).rows[0].cnt;

    res.json({ status: 'success', data: { ...r.rows[0], credit_remain: purch - usedAfter } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

module.exports = router;