const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { pool } = require('../db');
const { verifyToken } = require('../middlewares/auth');

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,16}$/;

router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: 'failed', message: '欄位未填寫正確' });
    }
    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ status: 'failed', message: '密碼不符合規則' });
    }
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ status: 'failed', message: 'Email 已被註冊' });
    }
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at',
      [email, hash, name || null, 'USER']
    );
    res.status(201).json({ status: 'success', data: { user: r.rows[0] } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: 'failed', message: '欄位未填寫正確' });
    }
    const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (r.rows.length === 0) {
      return res.status(400).json({ status: 'failed', message: '帳號或密碼錯誤' });
    }
    const user = r.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ status: 'failed', message: '帳號或密碼錯誤' });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_DAY || '30d' }
    );
    res.json({ status: 'success', data: { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

router.get('/profile', verifyToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = $1', [req.user.id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ status: 'failed', message: '找不到使用者' });
    }
    res.json({ status: 'success', data: { user: r.rows[0] } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ status: 'failed', message: '欄位未填寫正確' });
    }
    const r = await pool.query(
      'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name, role, created_at, updated_at',
      [name, req.user.id]
    );
    res.json({ status: 'success', data: { user: r.rows[0] } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

router.put('/password', verifyToken, async (req, res) => {
  try {
    const { password, new_password } = req.body;
    if (!password || !new_password) {
      return res.status(400).json({ status: 'failed', message: '欄位未填寫正確' });
    }
    if (!PASSWORD_REGEX.test(new_password)) {
      return res.status(400).json({ status: 'failed', message: '密碼不符合規則' });
    }
    const r = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = r.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ status: 'failed', message: '舊密碼錯誤' });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ status: 'success', message: '密碼修改成功' });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

router.get('/credit-package', verifyToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT cp.id, cp.user_id, cp.credit_package_id, cp.purchased_at,
        pkg.name, pkg.credit_amount AS purchased_credits, pkg.price AS price_paid
      FROM credit_purchases cp
      JOIN credit_packages pkg ON pkg.id = cp.credit_package_id
      WHERE cp.user_id = $1
      ORDER BY cp.purchased_at DESC
    `, [req.user.id]);
    res.json({ status: 'success', data: r.rows });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

router.get('/courses', verifyToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT cb.id, cb.user_id, cb.course_id, cb.created_at, cb.cancelled_at,
        co.name, co.start_at, co.end_at,
        u.name AS coach_name, s.name AS skill_name
      FROM course_bookings cb
      JOIN courses co ON co.id = cb.course_id
      JOIN users u ON u.id = co.user_id
      LEFT JOIN skills s ON s.id = co.skill_id
      WHERE cb.user_id = $1
      ORDER BY cb.created_at DESC
    `, [req.user.id]);

    const purchased = (await pool.query(
      'SELECT COALESCE(SUM(pkg.credit_amount), 0)::int AS total FROM credit_purchases cp JOIN credit_packages pkg ON pkg.id = cp.credit_package_id WHERE cp.user_id = $1',
      [req.user.id]
    )).rows[0].total;
    const used = (await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM course_bookings WHERE user_id = $1 AND cancelled_at IS NULL',
      [req.user.id]
    )).rows[0].cnt;

    res.json({ status: 'success', data: { course_booking: r.rows, credit_remain: purchased - used } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

module.exports = router;