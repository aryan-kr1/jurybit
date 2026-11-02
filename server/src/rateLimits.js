const jwt = require("jsonwebtoken");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

function limiter({ windowMs, limit, message, ...rest }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    ...rest,
  });
}

// Only failed logins count (responses with status 400 or higher).
const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: "Too many failed login attempts. Try again in a few minutes.",
});

const registerLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 50,
  message: "Too many accounts created from this network. Try again later.",
});

// Limits per logged-in user, and falls back to the IP address when the
// token is missing or invalid.
function userOrIpKey(req) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme === "Bearer" && token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      return `user:${payload.id}`;
    } catch {
      // fall through to the IP address
    }
  }
  return ipKeyGenerator(req.ip);
}

const submitLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: userOrIpKey,
  message: "You are submitting too fast. Wait a moment and try again.",
});

module.exports = { loginLimiter, registerLimiter, submitLimiter };
