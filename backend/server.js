const crypto = require("crypto");
const nodemailer = require("nodemailer");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const db = require("./database");

const app = express();

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "development_secret_key_for_local_only_123456";

if (JWT_SECRET.length < 32) {
    console.warn("JWT_SECRET is short; using a fallback development secret.");
}

const allowedOrigins = (
    process.env.FRONTEND_URL || "http://localhost:5173"
).split(",").map(origin => origin.trim().replace(/\/+$/, ""));

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json({ limit: "10kb" }));
app.get("/", (req, res) => {
    res.json({
        message: "Backend API is running successfully!"
    });
});
// Create an authentication token
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

// Middleware to protect private endpoints
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Authentication required."
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({
            message: "Invalid or expired token."
        });
    }
}

// REGISTER
app.post("/api/auth/register", async (req, res) => {
    try {
        const rawEmailInput = typeof req.body.email === "string" ? req.body.email : "";
        const rawPhoneInput = typeof req.body.phonenumber === "string" ? req.body.phonenumber : "";
        const legacyIdentifier = typeof req.body.identifier === "string" ? req.body.identifier : "";
        const rawEmail = rawEmailInput || (legacyIdentifier.includes("@") ? legacyIdentifier : "");
        const rawPhone = rawPhoneInput || (!legacyIdentifier.includes("@") ? legacyIdentifier : "");
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

        if (!cleanPhone && !cleanEmail) {
            return res.status(400).json({
                message: "Phone number or email is required."
            });
        }

        if (cleanPhone && (cleanPhone.length < 7 || cleanPhone.length > 20)) {
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

        if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
            return res.status(400).json({
                message: "Password must be at least 8 characters and no more than 72 bytes."
            });
        }

       const existingUser = db.prepare(`
    SELECT id FROM users
    WHERE (phonenumber = ? AND ? <> '')
       OR (email = ? AND ? <> '')
`).get(cleanPhone, cleanPhone, cleanEmail, cleanEmail);
console.log("[REGISTER] Submitted:", {
    email: cleanEmail,
    phone: cleanPhone
});

console.log("[REGISTER] Existing user:", existingUser || "NONE");

        if (existingUser) {
            return res.status(409).json({
                message: "An account with this phone number or email already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

   const isEmailRegistration = Boolean(cleanEmail);

// Email registrations must verify their email.
// Phone-only registrations are automatically verified.
const isVerified = isEmailRegistration ? 0 : 1;

// Generate a secure verification token.
let verificationToken = null;

if (isEmailRegistration) {
    verificationToken = crypto.randomBytes(32).toString("hex");
}

const result = db.prepare(`
    INSERT INTO users (name, email, phonenumber, password, is_verified)
    VALUES (?, ?, ?, ?, ?)
`).run(
    cleanName,
    cleanEmail || "",
    cleanPhone || null,
    hashedPassword,
    isVerified
);

const userId = result.lastInsertRowid;

// Create a hashed verification token in the database.
if (isEmailRegistration) {
    const tokenHash = crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex");

    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    db.prepare(`
        INSERT INTO email_verification_tokens
        (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
    `).run(userId, tokenHash, expiresAt);
}

        const user = {
            id: Number(result.lastInsertRowid),
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
        console.error("[REGISTER ERROR]", {
    code: error.code,
    message: error.message,
    stack: error.stack
});
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                message: "An account with this phone number or email already exists."
            });
        }

        console.error("Registration error:", error.message);

        return res.status(500).json({
            message: "An unexpected server error occurred."
        });
    }
    
});
// Verify user's email address
app.get("/api/auth/verify-email", (req, res) => {
    try {
        const token = req.query.token;

        // Check that the token has the expected format.
        if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).json({
                success: false,
                message: "Invalid verification link."
            });
        }

        // Hash the token before searching the database.
        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        // Find a valid, unused, unexpired token.
        const verification = db.prepare(`
            SELECT user_id
            FROM email_verification_tokens
            WHERE token_hash = ?
              AND used = 0
              AND expires_at > ?
        `).get(tokenHash, Date.now());

        if (!verification) {
            return res.status(400).json({
                success: false,
                message: "This verification link is invalid, expired, or already used."
            });
        }

        // Verify the email and mark the token as used together.
        const verifyTransaction = db.transaction(() => {
            const result = db.prepare(`
                UPDATE email_verification_tokens
                SET used = 1
                WHERE token_hash = ?
                  AND used = 0
                  AND expires_at > ?
            `).run(tokenHash, Date.now());

            if (result.changes !== 1) {
                return false;
            }

            db.prepare(`
                UPDATE users
                SET is_verified = 1
                WHERE id = ?
            `).run(verification.user_id);

            return true;
        });

        const verified = verifyTransaction();

        if (!verified) {
            return res.status(400).json({
                success: false,
                message: "This verification link is invalid, expired, or already used."
            });
        }

        return res.json({
            success: true,
            message: "Your email has been verified successfully! You can now log in."
        });

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
        const rawEmailInput = typeof req.body.email === "string" ? req.body.email : "";
        const rawPhoneInput = typeof req.body.phonenumber === "string" ? req.body.phonenumber : "";
        const legacyIdentifier = typeof req.body.identifier === "string" ? req.body.identifier : "";
        const rawEmail = rawEmailInput || (legacyIdentifier.includes("@") ? legacyIdentifier : "");
        const rawPhone = rawPhoneInput || (!legacyIdentifier.includes("@") ? legacyIdentifier : "");
        const { password } = req.body;

        if (typeof password !== "string" || (!rawEmail && !rawPhone)) {
            return res.status(400).json({
                message: "Phone number or email and password are required."
            });
        }

        const cleanEmail = rawEmail.trim().toLowerCase();
        const cleanPhone = rawPhone.trim();

        const user = db.prepare(
            "SELECT * FROM users WHERE phonenumber = ? OR email = ?"
        ).get(cleanPhone || "", cleanEmail || "");

        if (
            !user ||
            !(await bcrypt.compare(password, user.password))
        ) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }
// Prevent users with unverified email addresses from logging in.
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
        console.error("Login error:", error.message);

        return res.status(500).json({
            message: "An unexpected server error occurred."
        });
    }
});

// GET CURRENT USER
app.get("/api/auth/me", authenticateToken, (req, res) => {
    const user = db.prepare(`
        SELECT id, name, email, phonenumber, created_at
        FROM users
        WHERE id = ?
    `).get(req.user.id);

    if (!user) {
        return res.status(404).json({
            message: "User not found."
        });
    }

    return res.json({ user });
});
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT || 465),
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});
app.post("/api/auth/forgot-password", async (req, res) => {
    const genericMessage =
        "If an account exists for that email, reset instructions will be sent.";

    try {
        const email = req.body.email;

        if (typeof email !== "string" || email.length > 254) {
            return res.status(200).json({ message: genericMessage });
        }

        const user = db.prepare(
            "SELECT id, email FROM users WHERE email = ?"
        ).get(email.trim().toLowerCase());

        if (!user) {
            return res.status(200).json({ message: genericMessage });
        }

        // Invalidate previous unused reset links for this user.
        db.prepare(`
            UPDATE password_resets
            SET used = 1
            WHERE user_id = ? AND used = 0
        `).run(user.id);

        // Generate a cryptographically random reset token.
        const token = crypto.randomBytes(32).toString("hex");

        // Store only the hash of the token.
        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const expiresAt = Date.now() + 15 * 60 * 1000;

        db.prepare(`
            INSERT INTO password_resets
                (user_id, token_hash, expires_at)
            VALUES (?, ?, ?)
        `).run(user.id, tokenHash, expiresAt);

        const resetLink =
            `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: "Reset your password",
            text: `Use this link to reset your password within 15 minutes:\n\n${resetLink}\n\nIf you did not request this, ignore this email.`
        });

        return res.status(200).json({ message: genericMessage });

    } catch (error) {
        console.error("Password-reset request failed:", error.message);

        return res.status(500).json({
            message: "Unable to process the request right now."
        });
    }
});
app.post("/api/auth/reset-password", async (req, res) => {
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

        const reset = db.prepare(`
            SELECT id, user_id
            FROM password_resets
            WHERE token_hash = ?
              AND used = 0
              AND expires_at > ?
        `).get(tokenHash, Date.now());

        if (!reset) {
            return res.status(400).json({
                message: "The reset link is invalid or has expired."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        // Consume the token and change the password atomically.
        const updatePassword = db.transaction(() => {
            const result = db.prepare(`
                UPDATE password_resets
                SET used = 1
                WHERE id = ?
                  AND used = 0
                  AND expires_at > ?
            `).run(reset.id, Date.now());

            if (result.changes !== 1) {
                return false;
            }

            db.prepare(`
                UPDATE users
                SET password = ?
                WHERE id = ?
            `).run(hashedPassword, reset.user_id);

            // Invalidate other outstanding reset links.
            db.prepare(`
                UPDATE password_resets
                SET used = 1
                WHERE user_id = ?
            `).run(reset.user_id);

            return true;
        });

        if (!updatePassword()) {
            return res.status(400).json({
                message: "The reset link is invalid or has expired."
            });
        }

        return res.json({
            message: "Password reset successfully. Please sign in again."
        });

    } catch (error) {
        console.error("Password reset failed:", error.message);

        return res.status(500).json({
            message: "Unable to reset the password right now."
        });
    }
});

app.get("/api/messages", authenticateToken, (req, res) => {
  try {
    const messages = db.prepare(`
      SELECT id, user_id, message, created_at
      FROM messages
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(req.user.id);

    return res.json({ messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({
      message: "Unable to load messages right now."
    });
  }
});

app.post("/api/messages", authenticateToken, (req, res) => {
  try {
    const { message } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        message: "Please enter a message."
      });
    }

    const user = db.prepare(`
      SELECT id
      FROM users
      WHERE id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(401).json({
        message: "Your session is no longer valid. Please sign in again."
      });
    }

    const result = db.prepare(`
      INSERT INTO messages (user_id, message)
      VALUES (?, ?)
    `).run(user.id, message.trim());

    res.status(201).json({
      message: "Message saved.",
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error("Error saving message:", error);

    res.status(500).json({
      message: "loading"
    });
  }
});
// Start server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running on port ${PORT}`);
});