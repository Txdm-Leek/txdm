const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(
    process.env.DB_PATH || path.resolve(__dirname, "users.db")
);

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

function tableExists(name) {
    return !!db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(name);
}

function rebuildBrokenTable(tableName, createSql, copyRowsSql, deleteOldTable = false) {
    const tableSql = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(tableName)?.sql || "";

    if (!tableSql || tableSql.includes("users_old") || tableSql.includes("messages_old")) {
        const existingRows = copyRowsSql ? db.prepare(copyRowsSql).all() : [];

        if (deleteOldTable) {
            db.exec(`DROP TABLE IF EXISTS ${tableName};`);
        } else {
            db.exec(`ALTER TABLE ${tableName} RENAME TO ${tableName}_old;`);
        }

        db.exec(createSql);

        if (existingRows.length) {
            const columns = Object.keys(existingRows[0]);
            for (const row of existingRows) {
                const values = columns.map((column) => row[column]);
                const placeholders = columns.map(() => "?").join(", ");
                const insertSql = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`;
                db.prepare(insertSql).run(...values);
            }
        }

        db.exec(`DROP TABLE IF EXISTS ${tableName}_old;`);
    }
}

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        phonenumber TEXT,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all();
const hasPhoneColumn = userColumns.some((column) => column.name === "phonenumber");

if (!hasPhoneColumn) {
    const hasUsersOld = tableExists("users_old");

    if (!hasUsersOld) {
        db.exec(`PRAGMA foreign_keys = OFF;`);

        db.exec(`
            BEGIN IMMEDIATE;
            ALTER TABLE users RENAME TO users_old;
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                phonenumber TEXT UNIQUE,
                password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO users (id, name, email, phonenumber, password, created_at)
            SELECT id, name, email, NULL, password, created_at
            FROM users_old;
            DROP TABLE users_old;
            COMMIT;
        `);

        db.exec(`PRAGMA foreign_keys = ON;`);
    }
}
// Add email verification status to existing users
const updatedUserColumns = db.prepare(
    "PRAGMA table_info(users)"
).all();

const hasVerifiedColumn = updatedUserColumns.some(
    (column) => column.name === "is_verified"
);

if (!hasVerifiedColumn) {
    db.exec(`
        ALTER TABLE users
        ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 1
    `);
}

// Create email verification tokens table
db.exec(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);
// Ensure email and phone numbers are unique
db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users(email)
    WHERE email <> '';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
    ON users(phonenumber)
    WHERE phonenumber IS NOT NULL AND phonenumber <> '';
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

const passwordResetSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'password_resets'"
).get()?.sql || "";

if (passwordResetSql.includes("users_old")) {
    const resetRows = db.prepare(
        "SELECT * FROM password_resets"
    ).all();

    db.exec(`DROP TABLE IF EXISTS password_resets;`);
    db.exec(`
        CREATE TABLE password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at INTEGER NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    for (const row of resetRows) {
        db.prepare(`
            INSERT INTO password_resets (id, user_id, token_hash, expires_at, used)
            VALUES (?, ?, ?, ?, ?)
        `).run(row.id, row.user_id, row.token_hash, row.expires_at, row.used);
    }
}

const messageTableExists = tableExists("messages");

if (!messageTableExists) {
    db.exec(`
        CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
} else {
    const messageColumns = db.prepare("PRAGMA table_info(messages)").all();
    const hasUserIdColumn = messageColumns.some((column) => column.name === "user_id");
    const messageSql = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'"
    ).get()?.sql || "";

    if (!hasUserIdColumn || messageSql.includes("users_old")) {
        const previousRows = db.prepare(
            "SELECT id, user_id, message, created_at FROM messages"
        ).all();

        db.exec(`DROP TABLE IF EXISTS messages;`);
        db.exec(`
            CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        for (const row of previousRows) {
            if (row.user_id !== null && Number.isInteger(row.user_id)) {
                db.prepare(`
                    INSERT INTO messages (id, user_id, message, created_at)
                    VALUES (?, ?, ?, ?)
                `).run(row.id, row.user_id, row.message, row.created_at);
            }
        }
    }
}

const orphanedMessageCount = db.prepare(
    "DELETE FROM messages WHERE user_id IS NULL"
).run().changes;

if (orphanedMessageCount > 0) {
    console.log(`Removed ${orphanedMessageCount} orphaned message records with no user.`);
}

module.exports = db;