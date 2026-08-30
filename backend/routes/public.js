const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET / - public coach list with pagination
router.get('/', async (req, res) => {
  try {
    const { per, page } = req.query;
    if (!per || !page) {
      return res.status(400).json({ status: 'failed', message: '請提供 per 與 page 參數' });
    }
    const limit = Number(per);
    const offset = (Number(page) - 1) * limit;
    const r = await pool.query(`
      SELECT c.id, c.user_id, u.name, c.experience_years, c.description, c.profile_image_url, c.created_at, c.updated_at
      FROM coaches c
      JOIN users u ON u.id = c.user_id
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    res.json({ status: 'success', data: r.rows });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// GET /:id - public coach detail
router.get('/:id', async (req, res) => {
  try {
    const coach = (await pool.query('SELECT * FROM coaches WHERE id = $1', [req.params.id])).rows[0];
    if (!coach) return res.status(400).json({ status: 'failed', message: '找不到教練' });
    const user = (await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [coach.user_id])).rows[0];
    const skills = (await pool.query(
      'SELECT s.id, s.name FROM coach_link_skill cls JOIN skills s ON s.id = cls.skill_id WHERE cls.coach_id = $1', [coach.id]
    )).rows;
    res.json({ status: 'success', data: { user, coach: { ...coach, skills } } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// GET /:id/courses - public coach courses
router.get('/:id/courses', async (req, res) => {
  try {
    const coach = (await pool.query('SELECT * FROM coaches WHERE id = $1', [req.params.id])).rows[0];
    if (!coach) return res.status(400).json({ status: 'failed', message: '找不到教練' });
    const user = (await pool.query('SELECT name FROM users WHERE id = $1', [coach.user_id])).rows[0];
    const r = await pool.query(`
      SELECT co.*, u.name AS coach_name, s.name AS skill_name
      FROM courses co
      JOIN users u ON u.id = co.user_id
      LEFT JOIN skills s ON s.id = co.skill_id
      WHERE co.user_id = $1 AND co.end_at > NOW()
      ORDER BY co.start_at ASC
    `, [coach.user_id]);
    res.json({ status: 'success', data: r.rows });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

module.exports = router;