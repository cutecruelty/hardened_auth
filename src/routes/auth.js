const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { rateLimiter } = require("../rateLimiter");
const {
  registerPassword,
  isValidTelegramHandle,
} = require("../services/validation");

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

router.post("/register", async (req, res) => {
  const { name, password } = req.body;

  if (!isValidTelegramHandle(name)) {
    return res.status(400).json({ error: "invalid telegram handle" });
  }

  const result = await registerPassword(password);
  if (!result.success) {
    return res.status(400).json({ errors: result.errors });
  }

  const insertResult = await pool.query(
    "INSERT INTO users (name, password_hash) VALUES ($1, $2) RETURNING id, name",
    [name, result.hashedPassword],
  );

  res.status(201).json(insertResult.rows[0]);
});

router.post("/login", rateLimiter, async (req, res) => {
  const { name, password } = req.body;

  const userResult = await pool.query("SELECT * FROM users WHERE name = $1", [
    name,
  ]);
  const user = userResult.rows[0];

  if (!user) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(423).json({ error: "account temporarily locked" });
  }

  const matches = await bcrypt.compare(password, user.password_hash);

  if (!matches) {
    const newAttempts = user.failed_login_attempts + 1;
    let lockedUntil = null;

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    }

    await pool.query(
      "UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3",
      [newAttempts, lockedUntil, user.id],
    );

    return res.status(401).json({ error: "invalid credentials" });
  }

  await pool.query(
    "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1",
    [user.id],
  );

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  res.json({ token });
});

module.exports = router;
