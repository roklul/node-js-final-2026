const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { verifyToken } = require('../middlewares/auth');

// GET / - my coach profile (must be before /:userId)
router.get('/', verifyToken, async (req, res) => {
  try {
    const coach = (await pool.query('SELECT * FROM coaches WHERE user_id = $1', [req.user.id])).rows[0];
    if (!coach) return res.status(400).json({ status: 'failed', message: '尚未成為教練' });
    const skills = (await pool.query(
      'SELECT s.id FROM coach_link_skill cls JOIN skills s ON s.id = cls.skill_id WHERE cls.coach_id = $1', [coach.id]
    )).rows.map(s => s.id);
    res.json({ status: 'success', data: { ...coach, skill_ids: skills } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// PUT / - update my coach profile
router.put('/', verifyToken, async (req, res) => {
  try {
    const coach = (await pool.query('SELECT * FROM coaches WHERE user_id = $1', [req.user.id])).rows[0];
    if (!coach) return res.status(400).json({ status: 'failed', message: '尚未成為教練' });
    const { experience_years, description, profile_image_url, skill_ids } = req.body;
    if (profile_image_url && !profile_image_url.startsWith('https')) {
      return res.status(400).json({ status: 'failed', message: 'profile_image_url 必須是 https 開頭' });
    }
    await pool.query(
      `UPDATE coaches SET experience_years = COALESCE($1, experience_years), description = COALESCE($2, description),
       profile_image_url = COALESCE($3, profile_image_url), updated_at = NOW() WHERE id = $4`,
      [experience_years, description, profile_image_url, coach.id]
    );
    if (skill_ids && Array.isArray(skill_ids)) {
      await pool.query('DELETE FROM coach_link_skill WHERE coach_id = $1', [coach.id]);
      for (const sid of skill_ids) {
        await pool.query('INSERT INTO coach_link_skill (coach_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [coach.id, sid]);
      }
    }
    const updated = (await pool.query('SELECT * FROM coaches WHERE id = $1', [coach.id])).rows[0];
    const finalSkills = (await pool.query(
      'SELECT s.id FROM coach_link_skill cls JOIN skills s ON s.id = cls.skill_id WHERE cls.coach_id = $1', [coach.id]
    )).rows.map(s => s.id);
    res.json({ status: 'success', data: { ...updated, skill_ids: finalSkills } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// POST /courses - create course
router.post('/courses', verifyToken, async (req, res) => {
  try {
    const coach = (await pool.query('SELECT id FROM coaches WHERE user_id = $1', [req.user.id])).rows[0];
    if (!coach) return res.status(400).json({ status: 'failed', message: '尚未成為教練' });
    const { skill_id, name, description, start_at, end_at, max_participants, meeting_url } = req.body;
    if (!skill_id || !name || !start_at || !end_at || max_participants == null) {
      return res.status(400).json({ status: 'failed', message: '欄位未填寫正確' });
    }
    if (meeting_url && !meeting_url.startsWith('https')) {
      return res.status(400).json({ status: 'failed', message: 'meeting_url 必須是 https 開頭' });
    }
    const r = await pool.query(
      `INSERT INTO courses (user_id, skill_id, name, description, start_at, end_at, max_participants, meeting_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.id, skill_id, name, description || null, start_at, end_at, max_participants, meeting_url || null]
    );
    res.status(201).json({ status: 'success', data: { course: r.rows[0] } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// GET /courses - list my courses
router.get('/courses', verifyToken, async (req, res) => {
  try {
    const coach = (await pool.query('SELECT id FROM coaches WHERE user_id = $1', [req.user.id])).rows[0];
    if (!coach) return res.status(400).json({ status: 'failed', message: '尚未成為教練' });
    const r = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM course_bookings cb WHERE cb.course_id = c.id AND cb.cancelled_at IS NULL)::int AS participants,
        CASE WHEN c.start_at > NOW() THEN '尚未開始' WHEN c.end_at <= NOW() THEN '已結束' ELSE '進行中' END AS status
      FROM courses c WHERE c.user_id = $1 ORDER BY c.start_at DESC
    `, [req.user.id]);
    res.json({ status: 'success', data: r.rows });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// GET /courses/:id - single course (owner only)
router.get('/courses/:id', verifyToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ status: 'failed', message: '找不到課程' });
    if (r.rows[0].user_id !== req.user.id) return res.status(403).json({ status: 'failed', message: '無權限' });
    res.json({ status: 'success', data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// PUT /courses/:id - update course (owner only)
router.put('/courses/:id', verifyToken, async (req, res) => {
  try {
    const existing = (await pool.query('SELECT * FROM courses WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ status: 'failed', message: '找不到課程' });
    if (existing.user_id !== req.user.id) return res.status(403).json({ status: 'failed', message: '無權限' });
    const { skill_id, name, description, start_at, end_at, max_participants, meeting_url } = req.body;
    if (meeting_url && !meeting_url.startsWith('https')) {
      return res.status(400).json({ status: 'failed', message: 'meeting_url 必須是 https 開頭' });
    }
    const r = await pool.query(
      `UPDATE courses SET skill_id = COALESCE($1, skill_id), name = COALESCE($2, name),
       description = COALESCE($3, description), start_at = COALESCE($4, start_at), end_at = COALESCE($5, end_at),
       max_participants = COALESCE($6, max_participants), meeting_url = COALESCE($7, meeting_url), updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [skill_id, name, description, start_at, end_at, max_participants, meeting_url, req.params.id]
    );
    res.json({ status: 'success', data: { course: r.rows[0] } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

// POST /:userId - upgrade to coach (MUST be last to avoid catching /courses)
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { experience_years, description, profile_image_url, skill_ids } = req.body;
    const user = (await pool.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
    if (!user) return res.status(400).json({ status: 'failed', message: '找不到使用者' });
    const existing = (await pool.query('SELECT * FROM coaches WHERE user_id = $1', [userId])).rows[0];
    if (existing) return res.status(409).json({ status: 'failed', message: '已經是教練了' });
    await pool.query("UPDATE users SET role = 'COACH', updated_at = NOW() WHERE id = $1", [userId]);
    const c = await pool.query(
      'INSERT INTO coaches (user_id, experience_years, description, profile_image_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, experience_years || 0, description || null, profile_image_url || null]
    );
    const coach = c.rows[0];
    if (skill_ids && Array.isArray(skill_ids)) {
      for (const sid of skill_ids) {
        await pool.query('INSERT INTO coach_link_skill (coach_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [coach.id, sid]);
      }
    }
    res.status(201).json({ status: 'success', data: { user: { name: user.name, email: user.email, role: 'COACH' }, coach } });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

router.get('/revenue', verifyToken, async (req, res) => {
  try {
    const coach = (await pool.query('SELECT id FROM coaches WHERE user_id = $1', [req.user.id])).rows[0];
    if (!coach) return res.status(400).json({ status: 'failed', message: '尚未成為教練' });

    const { month } = req.query;
    if (!month) return res.status(400).json({ status: 'failed', message: '請提供月份' });

    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];
    const monthIndex = monthNames.indexOf(month.toLowerCase());
    if (monthIndex === -1) return res.status(400).json({ status: 'failed', message: '月份格式錯誤' });

    const year = new Date().getFullYear();
    const m = monthIndex + 1;
    const startDate = `${year}-${String(m).padStart(2, '0')}-01`;
    const endDate = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, '0')}-01`;

    // 全方案均價
    const pkgResult = await pool.query('SELECT COALESCE(SUM(price), 0)::numeric AS total_price, COALESCE(SUM(credit_amount), 0)::numeric AS total_credits FROM credit_packages');
    const totalPrice = Number(pkgResult.rows[0].total_price);
    const totalCredits = Number(pkgResult.rows[0].total_credits);
    const perCreditPrice = totalCredits > 0 ? totalPrice / totalCredits : 0;

    // 該月未取消報名數（以報名建立時間計）
    const bookingResult = await pool.query(`
      SELECT COUNT(*)::int AS cnt
      FROM course_bookings cb
      JOIN courses co ON co.id = cb.course_id
      WHERE co.user_id = $1
        AND cb.cancelled_at IS NULL
        AND cb.created_at >= $2
        AND cb.created_at < $3
    `, [req.user.id, startDate, endDate]);

    const cnt = bookingResult.rows[0].cnt;
    const revenue = Math.floor(cnt * perCreditPrice);

    res.json({
      status: 'success',
      data: {
        total: {
          revenue,
          participants: cnt,
          course_count: cnt,
        }
      }
    });
  } catch (e) {
    res.status(500).json({ status: 'failed', message: e.message });
  }
});

module.exports = router;