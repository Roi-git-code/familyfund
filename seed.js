
const pool = require("./db");

async function seed() {
  try {
    console.log("🌱 Starting seeding...");

    // -------------------------------------------------------
    // 1. INSERT MAIN ADMIN MEMBER
    // -------------------------------------------------------
    console.log("➡️ Seeding main admin/member...");

    const adminInsert = await pool.query(
      `
      INSERT INTO member (
        first_name, middle_name, sur_name, date_of_birth,
        marital_status, number_of_children, address, email, phone,
        father_alive, mother_alive, gender
      )
      VALUES (
        'ROI',
        'ISACK',
        'WAGUNDA',
        '2025-09-15',
        'single',
        0,
        'S.L.P 822, MUSOMA',
        'itzfamilyfund@gmail.com',
        '+255763724710',
        true,
        true,
        'Male'
      )
      ON CONFLICT (email) DO NOTHING
      RETURNING id;
      `
    );

    let memberId;

    if (adminInsert.rows.length > 0) {
      memberId = adminInsert.rows[0].id;
      console.log("✅ Admin inserted with ID:", memberId);
    } else {
      // Admin existed already — fetch ID
      const existing = await pool.query(
        `SELECT id FROM member WHERE email = 'itzfamilyfund@gmail.com' LIMIT 1`
      );
      memberId = existing.rows[0].id;
      console.log("ℹ️ Admin already exists, using ID:", memberId);
    }

    // -------------------------------------------------------
    // 2. INSERT NEXT OF KIN (BROTHER + MOTHER)
    // -------------------------------------------------------
    console.log("➡️ Seeding next of kin...");

    // Brother
    await pool.query(
      `
      INSERT INTO next_of_kin (
        member_id, first_name, middle_name, sur_name,
        relationship, gender, phone, address, email
      )
      VALUES (
        $1, 'PATRIC', 'SAMWEL', 'WAGUNDA',
        'Brother', 'Male', '+255763724710',
        'P.O.BOX 822, MUSOMA', 'wagunda@gmail.com'
      )
      ON CONFLICT DO NOTHING;
      `,
      [memberId]
    );

    // Mother
    await pool.query(
      `
      INSERT INTO next_of_kin (
        member_id, first_name, middle_name, sur_name,
        relationship, gender, phone, address, email
      )
      VALUES (
        $1, 'BHOKE', 'ALBERT', 'CHACHA',
        'Mother', 'Female', '+255757243353',
        'S.L.P 822, MUSOMA', 'bhoke@gmail.com'
      )
      ON CONFLICT DO NOTHING;
      `,
      [memberId]
    );

    console.log("✅ Next of kin inserted successfully!");

    // -------------------------------------------------------
    // 3. SEED FUND CATEGORIES
    // -------------------------------------------------------
    console.log("➡️ Seeding fund categories...");

    const fundPercents = JSON.parse(process.env.FUND_CATEGORY_PERCENTS || "{}");

    for (const [name, percentage] of Object.entries(fundPercents)) {
      await pool.query(
        `
        INSERT INTO fund_categories (name, percentage)
        VALUES ($1, $2)
        ON CONFLICT (name) DO NOTHING;
        `,
        [name, percentage]
      );
    }

    console.log("✅ Fund categories seeded successfully!");

    console.log("🎉 Seeding completed!");

  } catch (err) {
    console.error("❌ Seeding error:", err.message);
  } finally {
    await pool.end();
    console.log("🔌 Database connection closed.");
  }
}

seed();

