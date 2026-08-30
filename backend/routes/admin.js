const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// POST /api/skills - create skill
router.post('/coaches/skill', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ status: 'failed', message: '欄位未填寫正確' });
    }
    const exists = await pool.query('SELECT id FROM skills WHERE name = $1', [name.trim()]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ status: 'failed', message: '資料重複' });
    }
    const r = await pool.query('INSERT INTO skills (name) VALUES ($1) RETURNING *', [name.trim()]);
    res.status(201).json({ status: 'success', data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// GET /api/skills
router.get('/coaches/skill', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM skills ORDER BY created_at ASC');
    res.json({ status: 'success', data: r.rows });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// DELETE /api/skill/:id
router.delete('/coaches/skill/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM skills WHERE id = $1 RETURNING *', [req.params.id]);
    if (r.rows.length === 0) {
      return res.status(400).json({ status: 'failed', message: '找不到該技能' });
    }
    res.json({ status: 'success', data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// POST /api/credit-package
router.post('/credit-package', async (req, res) => {
  try {
    const { name, credit_amount, price } = req.body;
    if (!name || credit_amount == null || price == null) {
      return res.status(400).json({ status: 'failed', message: '欄位未填寫正確' });
    }
    const exists = await pool.query('SELECT id FROM credit_packages WHERE name = $1', [name]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ status: 'failed', message: '資料重複' });
    }
    const r = await pool.query(
      'INSERT INTO credit_packages (name, credit_amount, price) VALUES ($1, $2, $3) RETURNING *',
      [name, credit_amount, price]
    );
    res.status(201).json({ status: 'success', data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// GET /api/credit-package
router.get('/credit-package', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM credit_packages ORDER BY created_at ASC');
    res.json({ status: 'success', data: r.rows });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// DELETE /api/credit-package/:id
router.delete('/credit-package/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM credit_packages WHERE id = $1 RETURNING *', [req.params.id]);
    if (r.rows.length === 0) {
      return res.status(400).json({ status: 'failed', message: '找不到該方案' });
    }
    res.json({ status: 'success', data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

module.exports = router;
