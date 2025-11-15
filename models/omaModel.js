
// models/omaModel.js
const pool = require('../db');

async function createApplication(data, userId) {
  console.log('[DEBUG] createApplication data:', data, 'userId:', userId);
  const {
    first_name, middle_name, sur_name, date_of_birth,
    address, email, phone, marital_status, number_of_children,
    father_alive, mother_alive, gender
  } = data;

  const query = `
    INSERT INTO member_applications
      (user_id, first_name, middle_name, sur_name, date_of_birth, address, email, phone,
       marital_status, number_of_children, father_alive, mother_alive, gender)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
    mother_alive === 'on' || mother_alive === true,
    gender || null
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

// Next of Kin functions for OMAS
async function createNextOfKinForApplication(applicationId, kinData) {
  const {
    first_name, middle_name, sur_name, gender,
    email, phone, address, relationship
  } = kinData;

  const result = await pool.query(
    `INSERT INTO next_of_kin_applications (
      application_id, first_name, middle_name, sur_name, gender,
      email, phone, address, relationship
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      applicationId,
      first_name.trim(),
      middle_name?.trim() || '',
      sur_name.trim(),
      gender,
      email?.trim() || '',
      phone.trim(),
      address.trim(),
      relationship
    ]
  );

  return result.rows[0];
}

async function getNextOfKinsByApplicationId(applicationId) {
  const result = await pool.query(
    `SELECT * FROM next_of_kin_applications WHERE application_id = $1 ORDER BY id`,
    [applicationId]
  );
  return result.rows;
}


async function getApplicationWithKins(id) {
  console.log('[DEBUG] getApplicationWithKins:', id);
  try {
    // Get the application
    const appRes = await pool.query(
      'SELECT * FROM member_applications WHERE id=$1',
      [id]
    );
    
    if (appRes.rows.length === 0) {
      console.log('[DEBUG] No application found with id:', id);
      return null;
    }
    
    const application = appRes.rows[0];
    console.log('[DEBUG] Application found:', { 
      id: application.id, 
      name: `${application.first_name} ${application.sur_name}` 
    });
    
    // Get next of kins
    const kinsRes = await pool.query(
      `SELECT * FROM next_of_kin_applications WHERE application_id = $1 ORDER BY id`,
      [id]
    );
    
    // ✅ CORRECT: Create a NEW object with next_of_kins property
    const applicationWithKins = {
      ...application,  // Spread all properties from the original application
      next_of_kins: kinsRes.rows  // Add the next_of_kins property
    };
    
    console.log('[DEBUG] Next of kins loaded:', { 
      applicationId: applicationWithKins.id, 
      kinsCount: applicationWithKins.next_of_kins.length,
      kins: applicationWithKins.next_of_kins.map(k => `${k.first_name} ${k.sur_name}`)
    });
    
    return applicationWithKins;  // ✅ Return the NEW object
  } catch (err) {
    console.error('[DEBUG] getApplicationWithKins error:', err);
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


// FIXED: Only check for existing MEMBERS (not applications) during application
async function findExistingMember(email, phone) {
  console.log('[DEBUG] findExistingMember email=%s, phone=%s', email, phone);
  try {
    const res = await pool.query(
      `SELECT * FROM member WHERE email=$1 OR phone=$2`,
      [email?.trim() || '', phone?.trim() || '']
    );
    console.log('[DEBUG] findExistingMember result count:', res.rows.length);
    return res.rows;
  } catch (err) {
    console.error('[DEBUG] findExistingMember error:', err);
    throw err;
  }
}

// NEW: Check for pending applications from same user
async function findPendingApplicationsByUserId(userId) {
  console.log('[DEBUG] findPendingApplicationsByUserId:', userId);
  try {
    const res = await pool.query(
      `SELECT * FROM member_applications 
       WHERE user_id=$1 AND status IN ('Pending', 'Under Review')`,
      [userId]
    );
    console.log('[DEBUG] findPendingApplicationsByUserId count:', res.rows.length);
    return res.rows;
  } catch (err) {
    console.error('[DEBUG] findPendingApplicationsByUserId error:', err);
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

/* ---------- user-linked application queries ---------- */
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

// NEW: Get application by ID with user verification
async function getApplicationByIdAndUserId(id, userId) {
  console.log('[DEBUG] getApplicationByIdAndUserId:', { id, userId });
  try {
    const res = await pool.query(
      'SELECT * FROM member_applications WHERE id=$1 AND user_id=$2',
      [id, userId]
    );
    console.log('[DEBUG] getApplicationByIdAndUserId result:', res.rows[0]);
    return res.rows[0];
  } catch (err) {
    console.error('[DEBUG] getApplicationByIdAndUserId error:', err);
    throw err;
  }
}

// Add this to module.exports
module.exports = {
  createApplication,
  getApplicationById,
  getApplicationByIdAndUserId,
  getApplicationWithKins,
  findExistingMember,
  findPendingApplicationsByUserId,
  getAllApplications,
  updateApplicationStatus,
  createOmaUser,
  findOmaUserByPhone,
  getOmaUserById,
  getLatestApplicationByUserId,
  getApplicationsByUserId,
  createNextOfKinForApplication,
  getNextOfKinsByApplicationId
};

