const commonPasswordList = require("fxa-common-password-list");
const bcrypt = require("bcrypt");

const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, id: "length", msg: "at least 8 characters" },
  {
    test: (p) => /[A-Z]/.test(p),
    id: "upper",
    msg: "at least a single uppercase character",
  },
  {
    test: (p) => /[a-z]/.test(p),
    id: "lower",
    msg: "at least a single lowercase character",
  },
  {
    test: (p) => /[0-9]/.test(p),
    id: "num",
    msg: "at least a single number",
  },
  {
    test: (p) => /[!@#$%^&*(),.?":{}|<>_\-]/.test(p),
    id: "sym",
    msg: "at least a single symbol",
  },
];

async function registerPassword(password) {
  if (typeof password != "string") {
    throw new Error("invalid password data type");
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
      errors: ["this password is too common or has been compromised"],
    };
  }

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  return {
    success: true,
    hashedPassword: hashedPassword,
  };
}

function isValidTelegramHandle(name) {
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(name);
}

module.exports = { registerPassword, isValidTelegramHandle };
