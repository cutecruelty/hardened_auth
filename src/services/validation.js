const commonPasswordList = require("fxa-common-password-list");
const bcrypt = require("bcrypt");

const PASSWORD_RULES = Object.freeze([
  { test: (p) => p.length >= 8, id: "length", msg: "at least 8 characters" },
  { test: (p) => /[A-Z]/.test(p), id: "upper", msg: "one uppercase letter" },
  { test: (p) => /[a-z]/.test(p), id: "lower", msg: "one lowercase letter" },
  { test: (p) => /[0-9]/.test(p), id: "number", msg: "one number" },
  {
    test: (p) => /[!@#$%^&*(),.?":{}|<>_\-]/.test(p),
    id: "symbol",
    msg: "one symbol",
  },
]);

async function registerPassword(password) {
  if (typeof password !== "string") {
    throw new Error("invalid password input type");
  }

  const failedRules = PASSWORD_RULES.filter((rule) => !rule.test(password));
  if (failedRules.length > 0) {
    return {
      success: false,
      errors: failedRules.map((r) => r.msg),
    };
  }

  if (commonPasswordList.test(password.toLowerCase())) {
    return {
      success: false,
      errors: ["This password is too common and easily guessed"],
    };
  }

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  return {
    success: true,
    hashedPassword: hashedPassword,
  };
}
