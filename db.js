
// db.js
const { Pool } = require('pg');
require('dotenv').config();

// Render sets NODE_ENV=production automatically
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction
    ? { rejectUnauthorized: false }   // Render PostgreSQL requires SSL
    : false                           // Local DB must NOT use SSL
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

