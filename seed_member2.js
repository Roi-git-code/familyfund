
// seed_member2.js
const { pool } = require("./db");
require("dotenv").config();

async function seedMember() {
  try {
    console.log("🌱 Starting second member seeding...");

    const email = "wagundaisack@gmail.com";
    const phone = "0782702502";

    // -------------------------------------------------------
    // INSERT NEW MEMBER
    // -------------------------------------------------------
    console.log("➡️ Inserting new member...");

    const insertMember = await pool.query(
      `
      INSERT INTO member (
        first_name, middle_name, sur_name, date_of_birth,
        marital_status, number_of_children, address,
        email, phone, father_alive, mother_alive, gender
      )
      VALUES (
        'ROI',
        'ISACK',
        'PETER',
        '2025-09-15',
        'single',
        0,
        'S.L.P 822, MUSOMA',
        $1,
        $2,
        true,
        true,
        'Male'
      )
      ON CONFLICT (email) DO NOTHING
      RETURNING id;
      `,
      [email, phone]
    );

    let memberId;

    if (insertMember.rows.length > 0) {
      memberId = insertMember.rows[0].id;
      console.log("✅ New member inserted with ID:", memberId);
    } else {
      const existing = await pool.query(
        `SELECT id FROM member WHERE email = $1 LIMIT 1`,
        [email]
      );
      memberId = existing.rows[0].id;
      console.log("ℹ️ Member already exists, using ID:", memberId);
    }

    // -------------------------------------------------------
    // INSERT NEXT OF KIN
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

    console.log("✅ Next of kin added!");

    console.log("🎉 Second member seeding completed!");

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    console.log("🔌 Closing database...");
    await pool.end();
    console.log("🔌 Database connection closed.");
  }
}

seedMember();

