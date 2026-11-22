const crypto = require("crypto");
const nodemailer = require("nodemailer");
const path = require("path");

require("dotenv").config({
    path: path.resolve(__dirname, ".env")
});

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const { db, initDb } = require("./database");

const app = express();

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET ||
    "development_secret_key_for_local_only_123456";

if (JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters.");
}

const allowedOrigins = (
    [
        process.env.FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://7q5j8szg-5173.eun1.devtunnels.ms",
        "https://7q5j8szg-5000.eun1.devtunnels.ms"
    ]
        .filter(Boolean)
        .map(origin => origin.trim().replace(/\/+$/, ""))
);

const allowedOriginSet = new Set(allowedOrigins);

app.use(cors({
    origin(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }

        let normalizedOrigin;
        try {
            normalizedOrigin = new URL(origin).origin;
        } catch {
            return callback(new Error("Invalid CORS origin."));
        }

        const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalizedOrigin);
        const isDevTunnelOrigin = /^https:\/\/[^/]+\.devtunnels\.ms$/i.test(normalizedOrigin);

        if (allowedOriginSet.has(normalizedOrigin) || isLocalOrigin || isDevTunnelOrigin) {
            callback(null, true);
        } else {
            callback(new Error("Origin is not allowed by CORS."));
        }
    },
    credentials: true
}));
app.use(express.json({ limit: "10kb" }));

app.get("/", (req, res) => {
    res.json({
        message: "Backend API is running successfully!"
    });
});

// CREATE AUTHENTICATION TOKEN
function createToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email || "",
            phonenumber: user.phonenumber || ""
        },
        JWT_SECRET,
        { expiresIn: "1h" }
    );
}

// AUTHENTICATION MIDDLEWARE
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Authentication required."
        });
    }

    try {
        req.user = jwt.verify(
            authHeader.split(" ")[1],
            JWT_SECRET
        );

        next();
    } catch {
        return res.status(401).json({
            message: "Invalid or expired token."
        });
    }
}

// EMAIL TRANSPORTER
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 465),
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// REGISTER
app.post("/api/auth/register", async (req, res) => {
    try {
        const rawEmailInput =
            typeof req.body.email === "string" ? req.body.email : "";

        const rawPhoneInput =
            typeof req.body.phonenumber === "string"
                ? req.body.phonenumber : "";

        const legacyIdentifier =
            typeof req.body.identifier === "string"
                ? req.body.identifier : "";

        const rawEmail = rawEmailInput ||
            (legacyIdentifier.includes("@") ? legacyIdentifier : "");

        const rawPhone = rawPhoneInput ||
            (!legacyIdentifier.includes("@") ? legacyIdentifier : "");

        const { name, password } = req.body;

        if (
            typeof name !== "string" ||
            typeof password !== "string" ||
            (!rawPhone && !rawEmail)
        ) {
            return res.status(400).json({
                message: "Name, phone number, and password are required."
            });
        }

        const cleanName = name.trim();
        const cleanEmail = rawEmail.trim().toLowerCase();
        const cleanPhone = rawPhone.trim();

        if (cleanName.length < 2 || cleanName.length > 100) {
            return res.status(400).json({
                message: "Name must be between 2 and 100 characters."
            });
        }

        if (cleanPhone && (
            cleanPhone.length < 7 || cleanPhone.length > 20
        )) {
            return res.status(400).json({
                message: "Enter a valid phone number."
            });
        }

        if (cleanEmail && (
            cleanEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        )) {
            return res.status(400).json({
                message: "Enter a valid email address."
            });
        }

        if (password.length < 8 ||
            Buffer.byteLength(password, "utf8") > 72) {
            return res.status(400).json({
                message: "Password must be at least 8 characters and no more than 72 bytes."
            });
        }

        const existingUser = await db.query(`
            SELECT id FROM users
            WHERE (phonenumber = $1 AND $1 <> '')
               OR (email = $2 AND $2 <> '')
        `, [cleanPhone, cleanEmail]);

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                message: "An account with this phone number or email already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const isEmailRegistration = Boolean(cleanEmail);
        const isVerified = isEmailRegistration ? 0 : 1;

        let verificationToken = null;

        if (isEmailRegistration) {
            verificationToken = crypto.randomBytes(32).toString("hex");
        }

        const result = await db.query(`
            INSERT INTO users
                (name, email, phonenumber, password, is_verified)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [
            cleanName,
            cleanEmail || "",
            cleanPhone || null,
            hashedPassword,
            isVerified
        ]);

        const userId = result.rows[0].id;

        if (isEmailRegistration) {
            const tokenHash = crypto
                .createHash("sha256")
                .update(verificationToken)
                .digest("hex");

            const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

            await db.query(`
                INSERT INTO email_verification_tokens
                    (user_id, token_hash, expires_at)
                VALUES ($1, $2, $3)
            `, [userId, tokenHash, expiresAt]);
        }

        const user = {
            id: userId,
            name: cleanName,
            email: cleanEmail || "",
            phonenumber: cleanPhone
        };

        const token = createToken(user);

        return res.status(201).json({
            message: "Registration successful.",
            token,
            user
        });

    } catch (error) {
        console.error("[REGISTER ERROR]", error);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "An account with this phone number or email already exists."
            });
        }

        return res.status(500).json({
            message: "An unexpected server error occurred."
        });
    }
});

// VERIFY EMAIL
app.get("/api/auth/verify-email", async (req, res) => {
    try {
        const token = req.query.token;

        if (typeof token !== "string" ||
            !/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).json({
                success: false,
                message: "Invalid verification link."
            });
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const client = await db.connect();

        try {
            await client.query("BEGIN");

            const verification = await client.query(`
                SELECT user_id
                FROM email_verification_tokens
                WHERE token_hash = $1
                  AND used = 0
                  AND expires_at > $2
                FOR UPDATE
            `, [tokenHash, Date.now()]);

            if (verification.rows.length === 0) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: "This verification link is invalid, expired, or already used."
                });
            }

            const userId = verification.rows[0].user_id;

            await client.query(`
                UPDATE email_verification_tokens
                SET used = 1
                WHERE token_hash = $1
            `, [tokenHash]);

            await client.query(`
                UPDATE users
                SET is_verified = 1
                WHERE id = $1
            `, [userId]);

            await client.query("COMMIT");

            return res.json({
                success: true,
                message: "Your email has been verified successfully! You can now log in."
            });

        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error("[EMAIL VERIFICATION ERROR]", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong while verifying your email."
        });
    }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
    try {
        const rawEmailInput =
            typeof req.body.email === "string" ? req.body.email : "";

        const rawPhoneInput =
            typeof req.body.phonenumber === "string"
                ? req.body.phonenumber : "";

        const legacyIdentifier =
            typeof req.body.identifier === "string"
                ? req.body.identifier : "";

        const rawEmail = rawEmailInput ||
            (legacyIdentifier.includes("@") ? legacyIdentifier : "");

        const rawPhone = rawPhoneInput ||
            (!legacyIdentifier.includes("@") ? legacyIdentifier : "");

        const { password } = req.body;

        if (typeof password !== "string" ||
            (!rawEmail && !rawPhone)) {
            return res.status(400).json({
                message: "Phone number or email and password are required."
            });
        }

        const cleanEmail = rawEmail.trim().toLowerCase();
        const cleanPhone = rawPhone.trim();

        const result = await db.query(`
            SELECT * FROM users
            WHERE (phonenumber = $1 AND $1 <> '')
               OR (email = $2 AND $2 <> '')
            LIMIT 1
        `, [cleanPhone, cleanEmail]);

        const user = result.rows[0];

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        if (user.email && user.is_verified !== 1) {
            return res.status(403).json({
                success: false,
                requiresVerification: true,
                message: "Please verify your email address before logging in."
            });
        }

        const token = createToken(user);

        return res.json({
            message: "Login successful.",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phonenumber: user.phonenumber
            }
        });

    } catch (error) {
        console.error("[LOGIN ERROR]", error);

        return res.status(500).json({
            message: "An unexpected server error occurred."
        });
    }
});

// GET CURRENT USER
app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, name, email, phonenumber, created_at
            FROM users
            WHERE id = $1
        `, [req.user.id]);

        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        return res.json({ user });

    } catch (error) {
        console.error("[CURRENT USER ERROR]", error);

        return res.status(500).json({
            message: "Unable to retrieve user."
        });
    }
});

// FORGOT PASSWORD
app.post("/api/auth/forgot-password", async (req, res) => {
    const genericMessage =
        "If an account exists for that email, reset instructions will be sent.";

    try {
        const email = req.body.email;

        if (typeof email !== "string" || email.length > 254) {
            return res.status(200).json({ message: genericMessage });
        }

        const result = await db.query(`
            SELECT id, email
            FROM users
            WHERE email = $1
        `, [email.trim().toLowerCase()]);

        const user = result.rows[0];

        if (!user) {
            return res.status(200).json({ message: genericMessage });
        }

        await db.query(`
            UPDATE password_resets
            SET used = 1
            WHERE user_id = $1 AND used = 0
        `, [user.id]);

        const token = crypto.randomBytes(32).toString("hex");

        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const expiresAt = Date.now() + 15 * 60 * 1000;

        await db.query(`
            INSERT INTO password_resets
                (user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)
        `, [user.id, tokenHash, expiresAt]);

        const resetLink =
            `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: "Reset your password",
            text: `Use this link to reset your password within 15 minutes:\n\n${resetLink}\n\nIf you did not request this, ignore this email.`
        });

        return res.status(200).json({
            message: genericMessage
        });

    } catch (error) {
        console.error("[FORGOT PASSWORD ERROR]", error);

        return res.status(500).json({
            message: "Unable to process the request right now."
        });
    }
});

// RESET PASSWORD
app.post("/api/auth/reset-password", async (req, res) => {
    const client = await db.connect();

    try {
        const { token, password } = req.body;

        if (
            typeof token !== "string" ||
            !/^[a-f0-9]{64}$/.test(token) ||
            typeof password !== "string" ||
            password.length < 8 ||
            Buffer.byteLength(password, "utf8") > 72
        ) {
            return res.status(400).json({
                message: "Invalid reset request or password."
            });
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const hashedPassword = await bcrypt.hash(password, 12);

        await client.query("BEGIN");

        const resetResult = await client.query(`
            SELECT id, user_id
            FROM password_resets
            WHERE token_hash = $1
              AND used = 0
              AND expires_at > $2
            FOR UPDATE
        `, [tokenHash, Date.now()]);

        const reset = resetResult.rows[0];

        if (!reset) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "The reset link is invalid or has expired."
            });
        }

        await client.query(`
            UPDATE password_resets
            SET used = 1
            WHERE id = $1
        `, [reset.id]);

        await client.query(`
            UPDATE users
            SET password = $1
            WHERE id = $2
        `, [hashedPassword, reset.user_id]);

        await client.query(`
            UPDATE password_resets
            SET used = 1
            WHERE user_id = $1
        `, [reset.user_id]);

        await client.query("COMMIT");

        return res.json({
            message: "Password reset successfully. Please sign in again."
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("[RESET PASSWORD ERROR]", error);

        return res.status(500).json({
            message: "Unable to reset the password right now."
        });

    } finally {
        client.release();
    }
});

// GET MESSAGES
app.get("/api/messages", authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, user_id, message, created_at
            FROM messages
            WHERE user_id = $1
            ORDER BY created_at DESC, id DESC
        `, [req.user.id]);

        return res.json({
            messages: result.rows
        });

    } catch (error) {
        console.error("[GET MESSAGES ERROR]", error);

        return res.status(500).json({
            message: "Unable to load messages right now."
        });
    }
});

// SAVE MESSAGE
app.post("/api/messages", authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;

        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                message: "Please enter a message."
            });
        }

        const user = await db.query(`
            SELECT id FROM users
            WHERE id = $1
        `, [req.user.id]);

        if (user.rows.length === 0) {
            return res.status(401).json({
                message: "Your session is no longer valid. Please sign in again."
            });
        }

        const result = await db.query(`
            INSERT INTO messages (user_id, message)
            VALUES ($1, $2)
            RETURNING id
        `, [req.user.id, message.trim()]);

        return res.status(201).json({
            message: "Message saved.",
            id: result.rows[0].id
        });

    } catch (error) {
        console.error("[SAVE MESSAGE ERROR]", error);

        return res.status(500).json({
            message: "Unable to save message."
        });
    }
});

// START SERVER AFTER DATABASE INITIALIZATION
async function startServer() {
    try {
        await initDb();

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Backend running on port ${PORT}`);
        });

    } catch (error) {
        console.error("Database initialization failed:", error);
        process.exit(1);
    }
}

startServer();
