const { Pool } = require("pg");
const fs = require("fs");
require("dotenv").config();

async function createDatabase() {
  const bootstrapPool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "postgres",
    password: process.env.DB_PASSWORD,
    port: 5432,
  });

  await bootstrapPool.query("CREATE DATABASE hardened_auth");
  await bootstrapPool.end();
}

async function createTables() {
  const appPool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "hardened_auth",
    password: process.env.DB_PASSWORD,
    port: 5432,
  });

  const schema = fs.readFileSync("./schema.sql", "utf8");
  await appPool.query(schema);
  await appPool.end();
}

async function main() {
  await createDatabase();
  await createTables();
  console.log("database and tables ready");
}

main();
