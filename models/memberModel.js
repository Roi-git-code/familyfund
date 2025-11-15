

const pool = require('../db');

// Create new member
async function createMember(data) {
    const {
        first_name, middle_name, sur_name, date_of_birth,
        address, marital_status, number_of_children,
        father_alive, mother_alive, email, phone, gender
    } = data;

    // Required fields check
    if (!first_name || !sur_name || !date_of_birth || !address || !email || !phone || !gender) {
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

    // Insert and return the created member
    const result = await pool.query(
        `INSERT INTO member (
            first_name, middle_name, sur_name, date_of_birth,
            address, marital_status, number_of_children,
            father_alive, mother_alive, email, phone, gender
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *`,
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
            gender
        ]
    );

    return result.rows[0];
}

// Update member by ID
async function updateMember(id, data) {
    const {
        first_name, middle_name, sur_name, date_of_birth,
        address, marital_status, number_of_children,
        father_alive, mother_alive, email, phone, gender
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

    // Update and return the updated member - FIXED: removed updated_at if column doesn't exist
    const result = await pool.query(
        `UPDATE member SET
            first_name=$1, middle_name=$2, sur_name=$3,
            date_of_birth=$4, address=$5, marital_status=$6,
            number_of_children=$7, father_alive=$8, mother_alive=$9,
            email=$10, phone=$11, gender=$12
        WHERE id=$13
        RETURNING *`,
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
            gender,
            id
        ]
    );

    if (result.rows.length === 0) throw new Error('Member not found');
    return result.rows[0];
}

// Next of Kin functions
async function createNextOfKin(memberId, kinData) {
    const {
        first_name, middle_name, sur_name, gender,
        email, phone, address, relationship
    } = kinData;

    const result = await pool.query(
        `INSERT INTO next_of_kin (
            member_id, first_name, middle_name, sur_name, gender,
            email, phone, address, relationship
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
            memberId,
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

async function getNextOfKinsByMemberId(memberId) {
    const result = await pool.query(
        `SELECT * FROM next_of_kin WHERE member_id = $1 ORDER BY id`,
        [memberId]
    );
    return result.rows;
}

async function updateNextOfKin(kinId, kinData) {
    const {
        first_name, middle_name, sur_name, gender,
        email, phone, address, relationship
    } = kinData;

    const result = await pool.query(
        `UPDATE next_of_kin SET
            first_name=$1, middle_name=$2, sur_name=$3, gender=$4,
            email=$5, phone=$6, address=$7, relationship=$8
        WHERE id=$9
        RETURNING *`,
        [
            first_name.trim(),
            middle_name?.trim() || '',
            sur_name.trim(),
            gender,
            email?.trim() || '',
            phone.trim(),
            address.trim(),
            relationship,
            kinId
        ]
    );

    if (result.rows.length === 0) throw new Error('Next of kin not found');
    return result.rows[0];
}

async function deleteNextOfKin(kinId) {
    const result = await pool.query(
        'DELETE FROM next_of_kin WHERE id=$1 RETURNING *',
        [kinId]
    );
    if (result.rows.length === 0) throw new Error('Next of kin not found');
    return result.rows[0];
}

// Get member with next of kins
async function getMemberWithKins(id) {
    const member = await getMemberById(id);
    if (!member) return null;
    
    const kins = await getNextOfKinsByMemberId(id);
    return { ...member, next_of_kins: kins };
}

// Existing functions remain the same
async function getAllMembers() {
    const result = await pool.query('SELECT * FROM member ORDER BY id');
    return result.rows;
}

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
    getMemberById,
    createNextOfKin,
    getNextOfKinsByMemberId,
    updateNextOfKin,
    deleteNextOfKin,
    getMemberWithKins
};


