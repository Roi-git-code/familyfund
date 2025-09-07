// models/omaModel.js
const pool = require('../db');

async function createApplication(data, userId) {
  console.log('[DEBUG] createApplication data:', data, 'userId:', userId);
  const {
    first_name, middle_name, sur_name, date_of_birth,
    address, email, phone, marital_status, number_of_children,
    father_alive, mother_alive
  } = data;

  const query = `
    INSERT INTO member_applications
      (user_id, first_name, middle_name, sur_name, date_of_birth, address, email, phone,
       marital_status, number_of_children, father_alive, mother_alive)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`;
  const params = [
    userId,
    first_name?.trim(),
    middle_name?.trim() || null,
    sur_name?.trim(),
    date_of_birth,
    address?.trim(),
    email?.trim() || null,
    phone?.trim(),
    marital_status || null,
    parseInt(number_of_children) || 0,
    father_alive === 'on' || father_alive === true,
    mother_alive === 'on' || mother_alive === true
  ];

  try {
    console.log('[DEBUG] SQL:', query, params);
    const res = await pool.query(query, params);
    console.log('[DEBUG] createApplication result:', res.rows[0]);
    return res.rows[0];
  } catch (err) {
    console.error('[DEBUG] createApplication error:', err);
    throw err;
  }
}

async function getApplicationById(id) {
  console.log('[DEBUG] getApplicationById:', id);
  try {
    const res = await pool.query(
      'SELECT * FROM member_applications WHERE id=$1',
      [id]
    );
    console.log('[DEBUG] getApplicationById result:', res.rows[0]);
    return res.rows[0];
  } catch (err) {
    console.error('[DEBUG] getApplicationById error:', err);
    throw err;
  }
}

async function findByEmailOrPhone(email, phone) {
  console.log('[DEBUG] findByEmailOrPhone email=%s, phone=%s', email, phone);
  try {
    const res = await pool.query(
      `SELECT * FROM member_applications WHERE email=$1 OR phone=$2`,
      [email?.trim() || '', phone?.trim() || '']
    );
    console.log('[DEBUG] findByEmailOrPhone result count:', res.rows.length);
    return res.rows;
  } catch (err) {
    console.error('[DEBUG] findByEmailOrPhone error:', err);
    throw err;
  }
}

async function getAllApplications() {
  console.log('[DEBUG] getAllApplications');
  try {
    const res = await pool.query(
      'SELECT * FROM member_applications ORDER BY created_at DESC'
    );
    console.log('[DEBUG] getAllApplications count:', res.rows.length);
    return res.rows;
  } catch (err) {
    console.error('[DEBUG] getAllApplications error:', err);
    throw err;
  }
}

async function updateApplicationStatus(id, status, reviewerId = null, note = null) {
  console.log('[DEBUG] updateApplicationStatus', { id, status, reviewerId, note });
  const query = `
    UPDATE member_applications
    SET status=$1, reviewer_id=$2, reviewer_note=$3, updated_at=NOW()
    WHERE id=$4
    RETURNING *`;
  const params = [status, reviewerId, note, id];

  try {
    console.log('[DEBUG] SQL:', query, params);
    const res = await pool.query(query, params);
    console.log('[DEBUG] updateApplicationStatus result:', res.rows[0]);
    return res.rows[0];
  } catch (err) {
    console.error('[DEBUG] updateApplicationStatus error:', err);
    throw err;
  }
}

/* ---------- OMA user helpers ---------- */
async function createOmaUser({ first_name, middle_name, sur_name, phone, passwordHash, email }) {
  console.log('[DEBUG] createOmaUser:', { first_name, middle_name, sur_name, phone, email });
  const query = `
    INSERT INTO oma_users (first_name, middle_name, sur_name, phone, password, email)
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *`;
  const params = [
    first_name || null,
    middle_name || null,
    sur_name || null,
    phone.trim(),
    passwordHash,
    email || null
  ];
  try {
    console.log('[DEBUG] SQL:', query, params);
    const res = await pool.query(query, params);
    console.log('[DEBUG] createOmaUser result:', res.rows[0]);
    return res.rows[0];
  } catch (err) {
    console.error('[DEBUG] createOmaUser error:', err);
    throw err;
  }
}

async function findOmaUserByPhone(phone) {
  console.log('[DEBUG] findOmaUserByPhone phone:', phone);
  try {
    const res = await pool.query(
      'SELECT * FROM oma_users WHERE phone=$1',
      [phone.trim()]
    );
    console.log('[DEBUG] findOmaUserByPhone result:', res.rows[0]);
    return res.rows[0];
  } catch (err) {
    console.error('[DEBUG] findOmaUserByPhone error:', err);
    throw err;
  }
}

async function getOmaUserById(id) {
  console.log('[DEBUG] getOmaUserById:', id);
  try {
    const res = await pool.query(
      'SELECT * FROM oma_users WHERE id=$1',
      [id]
    );
    console.log('[DEBUG] getOmaUserById result:', res.rows[0]);
    return res.rows[0];
  } catch (err) {
    console.error('[DEBUG] getOmaUserById error:', err);
    throw err;
  }
}

/* ---------- New: user-linked application queries ---------- */
async function getLatestApplicationByUserId(userId) {
  console.log('[DEBUG] getLatestApplicationByUserId for:', userId);
  const query = `
    SELECT * FROM member_applications
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 1`;
  try {
    const { rows } = await pool.query(query, [userId]);
    console.log('[DEBUG] getLatestApplicationByUserId result:', rows[0]);
    return rows[0];
  } catch (err) {
    console.error('[DEBUG] getLatestApplicationByUserId error:', err);
    throw err;
  }
}

async function getApplicationsByUserId(userId) {
  console.log('[DEBUG] getApplicationsByUserId for:', userId);
  const query = `
    SELECT * FROM member_applications
    WHERE user_id = $1
    ORDER BY created_at DESC`;
  try {
    const { rows } = await pool.query(query, [userId]);
    console.log('[DEBUG] getApplicationsByUserId count:', rows.length);
    return rows;
  } catch (err) {
    console.error('[DEBUG] getApplicationsByUserId error:', err);
    throw err;
  }
}

module.exports = {
  createApplication,
  getApplicationById,
  findByEmailOrPhone,
  getAllApplications,
  updateApplicationStatus,
  createOmaUser,
  findOmaUserByPhone,
  getOmaUserById,
  getLatestApplicationByUserId,
  getApplicationsByUserId
};
