require("dotenv").config();

const path = require("path");
const Database = require("better-sqlite3");
const { db, initDb } = require("./database");

const sqlite = new Database(
    path.resolve(__dirname, "users.db"),
    { readonly: true }
);

async function migrate() {
    try {
        console.log("Starting database migration...");

        await initDb();

        const client = await db.connect();

        try {
            await client.query("BEGIN");

            const tables = [
                "users",
                "email_verification_tokens",
                "password_resets",
                "messages"
            ];

            for (const table of tables) {
                const exists = sqlite.prepare(`
                    SELECT name FROM sqlite_master
                    WHERE type = 'table' AND name = ?
                `).get(table);

                if (!exists) {
                    console.log(`Skipping missing table: ${table}`);
                    continue;
                }

                const rows = sqlite.prepare(
                    `SELECT * FROM "${table}"`
                ).all();

                if (rows.length === 0) {
                    console.log(`${table}: no records to migrate.`);
                    continue;
                }

                const allowedColumns = {
                    users: [
                        "id", "name", "email", "phonenumber",
                        "password", "is_verified", "created_at"
                    ],
                    email_verification_tokens: [
                        "id", "user_id", "token_hash",
                        "expires_at", "used"
                    ],
                    password_resets: [
                        "id", "user_id", "token_hash",
                        "expires_at", "used"
                    ],
                    messages: [
                        "id", "user_id", "message", "created_at"
                    ]
                }[table];

                const columns = allowedColumns.filter(column =>
                    rows[0] &&
                    Object.prototype.hasOwnProperty.call(rows[0], column)
                );

                for (const row of rows) {
                    const values = columns.map(column => row[column]);

                    const placeholders = columns.map(
                        (_, index) => `$${index + 1}`
                    );

                    await client.query(
                        `INSERT INTO "${table}"
                        (${columns.map(c => `"${c}"`).join(", ")})
                        VALUES (${placeholders.join(", ")})
                        ON CONFLICT (id) DO NOTHING`,
                        values
                    );
                }

                console.log(`${table}: ${rows.length} records processed.`);
            }

            for (const table of tables) {
                if (["users", "messages",
                    "email_verification_tokens",
                    "password_resets"].includes(table)) {

                    await client.query(`
                        SELECT setval(
                            pg_get_serial_sequence('"${table}"', 'id'),
                            COALESCE((SELECT MAX(id) FROM "${table}"), 1),
                            EXISTS (SELECT 1 FROM "${table}")
                        )
                    `);
                }
            }

            await client.query("COMMIT");

            console.log("Migration completed successfully!");

        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error("Migration failed:", error.message);
    } finally {
        sqlite.close();
        await db.end();
    }
}

migrate();