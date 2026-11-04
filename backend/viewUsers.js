const db = require("./database");

const users = db.prepare(`
    SELECT id, name, email, created_at
    FROM users
`).all();

console.table(users);

db.close();