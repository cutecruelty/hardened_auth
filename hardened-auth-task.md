# Project: Hardened Auth Service

A security-focused rebuild of an auth system, going past "login works" into "login actually resists the attacks a real login endpoint faces." You've already built basic register/login/JWT once, so this project skips that and goes straight into the parts that make an auth system genuinely hardened rather than just functional.

## Why this project

Your basic auth project covered: hashing passwords, issuing a JWT, verifying it in middleware. That's the happy path. This project covers what happens when things go wrong on purpose, someone stealing a token, someone guessing passwords, someone reusing a token they shouldn't have. That's the actual gap between "I did an auth tutorial" and "I understand auth security," and it's squarely inside your stated goal of closing the HTTP/security knowledge gap.

## Database schema

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP
);

CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  family_id UUID NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  event_type TEXT NOT NULL,
  ip_address TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE login_locations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  ip_address TEXT NOT NULL,
  country TEXT,
  logged_in_at TIMESTAMP DEFAULT NOW()
);
```

`family_id` on refresh tokens groups all tokens issued from the same original login, this is what lets you revoke an entire chain at once when reuse is detected, rather than tracking tokens one by one.

## Part 1 — Password validation

Reject weak passwords at register time, before they ever reach bcrypt.

- Minimum length (e.g. 10 characters)
- Reject anything found in a small hardcoded list of common passwords (`password123`, `qwerty`, etc, a short array is fine, doesn't need to be exhaustive)
- Return a clear `400` with which rule failed, don't just silently accept anything

## Part 2 — Account lockout

Separate concept from rate limiting, and worth understanding why both exist. Your `TokenBucket` rate limiter slows down one client (by IP) making too many requests too fast. Account lockout stops repeated failed attempts against one specific account, even if the attacker is spreading requests across many different IPs to dodge the rate limiter.

- On each failed login, increment `failed_login_attempts` for that user
- After N failures (e.g. 5), set `locked_until` to some time in the future (e.g. 15 minutes out)
- On login attempt, check `locked_until` first, before even checking the password, if still locked, reject with a `423 Locked` or `403`
- On a successful login, reset `failed_login_attempts` back to 0

## Part 3 — Refresh token rotation with reuse detection

This is the core security concept of the project, and it's genuinely subtle, worth sitting with.

- On login, issue two tokens: a short-lived access token (e.g. 15 min, same as your JWT before) and a longer-lived refresh token (e.g. 7 days). Generate the refresh token as a random string (not a JWT), hash it (like a password, using bcrypt or even a plain SHA-256 hash since it's not a password being typed by a human), and store the hash in `refresh_tokens` along with a new `family_id`.
- `POST /auth/refresh`: client sends their refresh token. Look up its hash in the table. If found and not revoked: issue a new access token AND a new refresh token (same `family_id`), mark the old refresh token row as used/revoked, return both.
- **The reuse detection part:** if a client ever sends a refresh token whose hash matches a row that's already marked revoked, that's a signal the token was stolen and used twice, once by the legitimate user, once by an attacker (or vice versa). When this happens, revoke every token sharing that `family_id`, forcing the legitimate user to log in again. Log this event to `audit_log` as something like `"refresh_token_reuse_detected"`.

## Part 4 — Security headers

```
npm install helmet
```

```js
const helmet = require("helmet");
app.use(helmet());
```

One line, but look up what at least three of the headers it sets actually do (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`) before moving on, don't just add it blind.

## Part 5 — Audit logging

Every one of these events gets a row in `audit_log`: successful login, failed login, account locked, refresh token issued, refresh token reuse detected, account registered. Include `ip_address` (from `req.ip`) on each one. This table is what a real security team would query after an incident, "show me every failed login for this account in the last 24 hours."

## Part 6 — The fun part: impossible travel + a honeypot route

Two additions, genuinely enjoyable to build and test yourself.

**Impossible travel detection.** On each successful login, look up the user's approximate location from their IP (use a free IP geolocation API, e.g. `ip-api.com`, no key needed for basic use) and store it in `login_locations`. On the next login, compare to the previous entry: if the two logins are far enough apart geographically that traveling between them in the elapsed time would be physically impossible (e.g. login from Russia, then 5 minutes later login from Brazil), flag it, log it to `audit_log` as `"impossible_travel_detected"`, and optionally require the account to verify itself somehow (or just log it for now, verification flow is a whole extra project). Test this by using a VPN or just editing your own IP-lookup call for a fake test IP.

**A honeypot login route.** Add a route like `POST /auth/admin-login` that doesn't actually exist in your real app, no legitimate user should ever call it. Anyone who hits it (a script scanning for admin panels, exactly the kind of thing real attackers do) gets logged to `audit_log` as `"honeypot_triggered"` with their IP, and you can optionally auto-block that IP from all other routes for a while (a `Set` or `Map` of banned IPs checked in a global middleware, similar shape to your rate limiter's per-client Map). This is a real, genuinely used technique, cheap to build, and satisfying to test by attacking your own server.

## File structure

```
hardened-auth/
├── src/
│   ├── db.js
│   ├── rateLimiter.js          # reused from before
│   ├── ipBanList.js            # new: Set/Map of banned IPs + middleware
│   ├── middleware/
│   │   ├── requireAuth.js      # reused from before
│   │   └── checkBanned.js      # new: rejects requests from banned IPs
│   ├── routes/
│   │   └── auth.js             # register, login, refresh, admin-login (honeypot)
│   ├── services/
│   │   ├── audit.js            # helper: logAuditEvent(userId, eventType, ip, metadata)
│   │   ├── lockout.js          # helper: check/increment/reset failed attempts
│   │   └── geolocation.js      # helper: look up IP location, compare to last login
│   └── server.js
├── public/
│   └── index.html
├── .env
├── .gitignore
├── package.json
└── README.md
```

## Suggested build order

1. DB schema, all four tables
2. Password validation on register (quick win, no new concepts)
3. Account lockout on login
4. Refresh token issuing + rotation (no reuse detection yet, just the happy path working)
5. Reuse detection added on top once rotation works
6. Security headers (one line, quick)
7. Audit logging, threaded through everything above
8. Honeypot route + IP ban list
9. Impossible travel detection last, since it depends on audit logging and login already being solid

## Testing checklist

- Register with a weak password, confirm it's rejected
- Fail login 5 times, confirm the 6th attempt is locked out even with the correct password
- Log in successfully, use the refresh token once, confirm it works and rotates
- Reuse the OLD (already-rotated) refresh token, confirm the whole family gets revoked and subsequent refresh attempts fail
- Hit the honeypot route, confirm it's logged and (if you built the ban) your IP gets blocked from other routes afterward
- Check `audit_log` after all of the above, confirm every event actually got recorded with a timestamp and IP

# Hardened Auth Service — Part 7: Frontend

A minimal frontend to actually see the security features working, instead of only checking them through Postman. Same approach as your notes project form, plain HTML + vanilla JS, no framework, since the point is testing the backend, not learning a frontend framework right now.

## Why bother with a frontend for this specifically

Most of what you built (lockout, reuse detection, honeypot, impossible travel) is much more convincing to see happen live in a browser than as isolated Postman requests, watching a UI actually show "account locked" after your 5th wrong password, or watching a security event appear in a live log, makes the concepts land in a way JSON responses in Postman don't.

## Pages needed

**`public/index.html`** — register + login, same shape as your notes project form. On successful login, store both the access token and refresh token (in memory via a JS variable is fine for now, don't worry about localStorage vs cookies security tradeoffs yet, that's a separate rabbit hole), then redirect or reveal the dashboard section.

**`public/dashboard.html`** (or just a second section of the same page, toggled visible after login) — shows:

- A "Security Log" panel, calls a new `GET /audit-log` route (behind `requireAuth`, only returns events for the logged-in user) and lists recent events (login success, failed attempts, lockouts, refresh token reuse if it ever happened to this account) in a simple list.
- A button labeled something like "Simulate expired session", which manually calls `POST /auth/refresh` so you can watch a new access token get issued and the old refresh token get revoked, visible in the log right after.
- A lockout indicator, after failed login attempts, show something like "3 attempts remaining" by reading a count back from the failed login response (you'll need to add this count to your login route's error response body, e.g. `{ error: "invalid credentials", attemptsRemaining: 2 }`).

## New backend piece needed to support this

```
GET /audit-log
```

Behind `requireAuth`. Query `audit_log` `WHERE user_id = req.userId ORDER BY created_at DESC LIMIT 20`. This is the only new route the frontend actually requires, everything else (register, login, refresh) already exists from Part 1-6.

## Suggested structure addition

```
public/
├── index.html       # register + login form
├── dashboard.html    # (or a toggled section) security log + refresh button
└── app.js            # shared fetch logic: register, login, refresh, get audit log
```

## What NOT to build here

Don't build a real session-persistence system (surviving a page refresh, remembering login across browser restarts), that's a legitimately separate, deep topic (localStorage vs httpOnly cookies vs in-memory, each with real security tradeoffs) and bolting it on now would dilute the actual point of this project, which is the backend security logic, not frontend auth state management. Keep the token in a plain JS variable that resets on page reload, that's fine and expected for this project's scope.

Don't style this heavily. A plain form, a plain list, maybe one button. The value here is watching real security events happen in response to real actions, not the visual design.

## Testing flow once this exists

1. Register, log in normally, watch the log show a `login_success` event.
2. Log out (just clear your in-memory token variable, or refresh the page), try logging in with a wrong password 5 times, watch "attempts remaining" count down, then get locked out on the 6th.
3. Wait out the lockout (or manually clear `locked_until` in pgAdmin to speed up testing), log in successfully again.
4. Click "Simulate expired session" a couple times, refresh the log, confirm you see refresh events appearing.
5. Manually replay an old refresh token (grab it from an earlier network request in dev tools, resend it after it's already been rotated once), confirm the reuse detection fires and shows up in the log.
6. Hit the honeypot route directly via the browser console or Postman (it's intentionally not linked anywhere in the UI, real attackers wouldn't find it through your frontend either), confirm it logs and your IP gets treated as banned on your next request.
