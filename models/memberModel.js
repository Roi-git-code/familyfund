const pool = require('../db');

// Create new member
async function createMember(data) {
  const {
    first_name, middle_name, sur_name, date_of_birth,
    address, marital_status, number_of_children,
    father_alive, mother_alive, email, phone
  } = data;

  // Required fields check
  if (!first_name || !sur_name || !date_of_birth || !address || !email || !phone) {
    throw new Error('Missing required fields');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) throw new Error('Invalid email format');

  if (phone.length < 8 || phone.length > 15) throw new Error('Phone number should be 8-15 digits');

  // Check uniqueness: full name
  const fullNameCheck = await pool.query(
    `SELECT * FROM member WHERE first_name=$1 AND middle_name=$2 AND sur_name=$3`,
    [first_name.trim(), middle_name?.trim() || '', sur_name.trim()]
  );
  if (fullNameCheck.rows.length > 0) throw new Error('A member with this full name already exists');

  // Check uniqueness: email
  const emailCheck = await pool.query(
    `SELECT * FROM member WHERE email=$1`,
    [email.trim()]
  );
  if (emailCheck.rows.length > 0) throw new Error('Email already exists');

  // Check uniqueness: phone
  const phoneCheck = await pool.query(
    `SELECT * FROM member WHERE phone=$1`,
    [phone.trim()]
  );
  if (phoneCheck.rows.length > 0) throw new Error('Phone number already exists');

  await pool.query(
    `INSERT INTO member (
      first_name, middle_name, sur_name, date_of_birth,
      address, marital_status, number_of_children,
      father_alive, mother_alive, email, phone
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      first_name.trim(),
      middle_name?.trim() || '',
      sur_name.trim(),
      date_of_birth,
      address.trim(),
      marital_status,
      parseInt(number_of_children) || 0,
      father_alive === 'on',
      mother_alive === 'on',
      email.trim(),
      phone.trim()
    ]
  );
}

// Update member by ID
async function updateMember(id, data) {
  const {
    first_name, middle_name, sur_name, date_of_birth,
    address, marital_status, number_of_children,
    father_alive, mother_alive, email, phone
  } = data;

  // Check uniqueness excluding current member
  const fullNameCheck = await pool.query(
    `SELECT * FROM member WHERE first_name=$1 AND middle_name=$2 AND sur_name=$3 AND id<>$4`,
    [first_name.trim(), middle_name?.trim() || '', sur_name.trim(), id]
  );
  if (fullNameCheck.rows.length > 0) throw new Error('A member with this full name already exists');

  const emailCheck = await pool.query(
    `SELECT * FROM member WHERE email=$1 AND id<>$2`,
    [email.trim(), id]
  );
  if (emailCheck.rows.length > 0) throw new Error('Email already exists');

  const phoneCheck = await pool.query(
    `SELECT * FROM member WHERE phone=$1 AND id<>$2`,
    [phone.trim(), id]
  );
  if (phoneCheck.rows.length > 0) throw new Error('Phone number already exists');

  await pool.query(
    `UPDATE member SET
      first_name=$1, middle_name=$2, sur_name=$3,
      date_of_birth=$4, address=$5, marital_status=$6,
      number_of_children=$7, father_alive=$8, mother_alive=$9,
      email=$10, phone=$11
    WHERE id=$12`,
    [
      first_name.trim(),
      middle_name?.trim() || '',
      sur_name.trim(),
      date_of_birth,
      address.trim(),
      marital_status,
      parseInt(number_of_children) || 0,
      father_alive === 'on',
      mother_alive === 'on',
      email.trim(),
      phone.trim(),
      id
    ]
  );
}

// Get all members
async function getAllMembers() {
  const result = await pool.query('SELECT * FROM member ORDER BY id');
  return result.rows;
}

// Get one member by ID
async function getMemberById(id) {
  const result = await pool.query('SELECT * FROM member WHERE id=$1', [id]);
  return result.rows[0];
}

async function deleteMember(id) {
  const result = await pool.query('DELETE FROM member WHERE id=$1 RETURNING *', [id]);
  if (result.rows.length === 0) throw new Error('Member not found');
  return result.rows[0];
}

module.exports = {
  deleteMember,
  createMember,
  updateMember,
  getAllMembers,
  getMemberById
};
