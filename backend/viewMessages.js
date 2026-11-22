const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, ".env")
});

const { db } = require("./database");

async function showMessages() {
  const result = await db.query(`
    SELECT
      m.id AS message_id,
      u.id AS user_id,
      u.name,
      u.email,
      u.phonenumber,
      m.message,
      m.created_at
    FROM messages m
    JOIN users u ON u.id = m.user_id
    ORDER BY m.created_at DESC, m.id DESC
  `);

  console.table(result.rows);
}

showMessages()
  .catch(error => {
    console.error("Could not load messages:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
