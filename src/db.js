const fs = require("fs");
require("dotenv").config();

const Pool = new Pool({
  user: "postgres",
  host: "postgres",
  database: "hardened_auth",
  password: process.env.DB_PASSWORD,
  port: 5432,
});

module.exports = pool;
