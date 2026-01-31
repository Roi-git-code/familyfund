
// models/userModel.js
const pool = require('../db');

// Get users by roles (without is_active check since column doesn't exist)
const getUsersByRoles = async (roles) => {
  try {
    if (!roles || roles.length === 0) {
      console.log('⚠️ No roles provided to getUsersByRoles');
      return [];
    }
    
    // Filter out undefined or null roles
    const validRoles = roles.filter(role => role && typeof role === 'string');
    
    if (validRoles.length === 0) {
      console.log('⚠️ No valid roles provided');
      return [];
    }
    
    const placeholders = validRoles.map((_, i) => `$${i + 1}`).join(',');
    const query = `
      SELECT 
        u.id,
        u.username as email,
        u.role,
        m.first_name,
        m.sur_name
      FROM users u
      LEFT JOIN member m ON u.member_id = m.id
      WHERE u.role IN (${placeholders})
      ORDER BY 
        CASE u.role
          WHEN 'admin' THEN 1
          WHEN 'chairman' THEN 2
          WHEN 'chief_signatory' THEN 3
          WHEN 'assistant_signatory' THEN 4
          ELSE 5
        END
    `;
    
    console.log('🔍 Querying users with roles:', validRoles);
    
    const result = await pool.query(query, validRoles);
    
    console.log(`✅ Found ${result.rows.length} users for roles:`, validRoles);
    result.rows.forEach(user => {
      const fullName = user.first_name && user.sur_name 
        ? `${user.first_name} ${user.sur_name}` 
        : 'Unknown';
      console.log(`   👤 ${user.email} (${user.role}) - ${fullName}`);
    });
    
    return result.rows;
  } catch (error) {
    console.error('❌ Error fetching users by roles:', error.message);
    console.error('Stack:', error.stack);
    return [];
  }
};

// Get user by role
const getUserByRole = async (role) => {
  try {
    if (!role) {
      console.log('⚠️ No role provided to getUserByRole');
      return null;
    }
    
    const query = `
      SELECT 
        u.id,
        u.username as email,
        u.role,
        m.first_name,
        m.sur_name
      FROM users u
      LEFT JOIN member m ON u.member_id = m.id
      WHERE u.role = $1
      LIMIT 1
    `;
    
    const result = await pool.query(query, [role]);
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const fullName = user.first_name && user.sur_name 
        ? `${user.first_name} ${user.sur_name}` 
        : 'Unknown';
      console.log(`✅ Found user for role ${role}: ${user.email} (${fullName})`);
      return user;
    } else {
      console.log(`⚠️ No user found for role: ${role}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error fetching user with role ${role}:`, error.message);
    return null;
  }
};

// Get all admin users
const getAllAdmins = async () => {
  try {
    const query = `
      SELECT u.username as email, u.role, m.first_name, m.sur_name
      FROM users u
      LEFT JOIN member m ON u.member_id = m.id
      WHERE u.role = 'admin'
    `;
    
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return [];
  }
};

module.exports = {
  getUsersByRoles,
  getUserByRole,
  getAllAdmins
};


