const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, ".env")
});

const { db } = require("./database");

async function showUsers() {
  const result = await db.query(`
    SELECT id, name, email, phonenumber, is_verified, created_at
    FROM users
    ORDER BY id ASC
  `);

  console.table(result.rows);
}

showUsers()
  .catch(error => {
    console.error("Could not load users:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());