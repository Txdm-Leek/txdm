const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from backend/.env");
}

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initDb() {
    // USERS
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(254) NOT NULL DEFAULT '',
            phonenumber VARCHAR(20),
            password TEXT NOT NULL,
            is_verified INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Unique email addresses, excluding empty values
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
        ON users(email)
        WHERE email <> ''
    `);

    // Unique phone numbers, excluding empty values
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
        ON users(phonenumber)
        WHERE phonenumber IS NOT NULL AND phonenumber <> ''
    `);

    // EMAIL VERIFICATION TOKENS
    await db.query(`
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            token_hash TEXT NOT NULL UNIQUE,
            expires_at BIGINT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0
        )
    `);

    // PASSWORD RESETS
    await db.query(`
        CREATE TABLE IF NOT EXISTS password_resets (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            token_hash TEXT NOT NULL UNIQUE,
            expires_at BIGINT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0
        )
    `);

    // MESSAGES
    await db.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log("PostgreSQL database initialized successfully.");
}

module.exports = { db, initDb };