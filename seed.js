

const pool = require('./db');

async function seed() {
  try {
    console.log("🌱 Seeding data...");

    // ---------------- Seed system admin ----------------
    await pool.query(`
      INSERT INTO member 
        (first_name, middle_name, sur_name, date_of_birth, address, marital_status, number_of_children, father_alive, mother_alive, email, phone)
      VALUES
        ('Family', 'Fund', 'Admin', '1990-01-01', 'P.O.BOX 344, HAI', 'Single', 0, true, true, 'familyfund@gmail.com', '0763724710')
      ON CONFLICT (email) DO NOTHING;
    `);

    console.log("✅ System admin inserted successfully!");

    // ---------------- Seed fund categories ----------------
    const fundPercents = JSON.parse(process.env.FUND_CATEGORY_PERCENTS);
    for (const [name, percentage] of Object.entries(fundPercents)) {
      await pool.query(
        `INSERT INTO fund_categories (name, percentage) 
         VALUES ($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [name, percentage]
      );
    }

    console.log("✅ Fund categories seeded successfully!");

  } catch (err) {
    console.error("❌ Error seeding data:", err);
  } finally {
    await pool.end();
  }
}

seed();
