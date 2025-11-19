
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const store = new pgSession({
  pool: pool,
  tableName: 'user_sessions',
  createTableIfMissing: true
});

console.log('✅ Using PostgreSQL for session storage');
module.exports = store;


