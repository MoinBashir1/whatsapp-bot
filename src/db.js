"use strict";

const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");

function buildPoolConfig() {
  const dbJsonPath = path.join(__dirname, "..", "database.json");
  if (fs.existsSync(dbJsonPath)) {
    const file = JSON.parse(fs.readFileSync(dbJsonPath, "utf8"));
    const env = process.env.NODE_ENV || Object.keys(file)[0];
    const config = file[env];
    if (!config) throw new Error(`No "${env}" entry found in database.json. Available: ${Object.keys(file).join(", ")}`);
    return {
      host: config.host,
      user: config.username,
      password: config.password,
      database: config.database,
      max: config.pool?.maxConnections || 10,
      idleTimeoutMillis: config.pool?.maxIdleTime || 30000,
      ssl: { rejectUnauthorized: false },
    };
  }
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };
  }
  throw new Error("No DB config found. Add database.json or set DATABASE_URL.");
}

const pool = new Pool(buildPoolConfig());

// ── Cron: pick leads ──────────────────────────────────────────────────────────

// Returns leads with their cohort's message, limited to batchSize.
async function getLeadsToPick(batchSize = 50) {
  const { rows } = await pool.query(
    `SELECT
       lc."id"           AS "leadCohortId",
       lc."cohortId",
       lc."userId",
       lc."phoneNumber",
       lc."name",
       c."metaData"->>'message' AS "cohortMessage"
     FROM leads_cohort lc
     JOIN cohorts c ON c."id" = lc."cohortId"
     WHERE lc."intentStatus" = 'to_be_picked'
     ORDER BY lc."createdAt" ASC
     LIMIT $1`,
    [batchSize]
  );
  return rows;
}

// Transaction: create session + mark lead as pending atomically.
async function createSessionAndMarkPending(lead) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO wa_bot_sessions ("phoneNumber", "name", "userId", "cohortId", "intentStatus")
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING "id"`,
      [lead.phoneNumber, lead.name, lead.userId, lead.cohortId]
    );
    const sessionId = rows[0].id;

    await client.query(
      `UPDATE leads_cohort SET "intentStatus" = 'pending', "updatedAt" = NOW() WHERE "id" = $1`,
      [lead.leadCohortId]
    );

    await client.query("COMMIT");
    return sessionId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Webhook: intent update ────────────────────────────────────────────────────

// Transaction: mark intentStatus in both wa_bot_sessions and leads_cohort atomically.
async function markIntent(sessionId, leadCohortId, intent) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE wa_bot_sessions SET "intentStatus" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [intent, sessionId]
    );

    await client.query(
      `UPDATE leads_cohort SET "intentStatus" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [intent, leadCohortId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Webhook: session lookup ───────────────────────────────────────────────────

// Find the active (pending/interested) session for a phone number.
// Normalizes the number — Meta sends 916005812088, DB stores 6005812088.
async function getActiveSessionByPhone(phoneNumber) {
  const digits = phoneNumber.replace(/\D/g, "");
  // Try both full international (916005812088) and local 10-digit (6005812088)
  const local = digits.length > 10 ? digits.slice(-10) : digits;

  const { rows } = await pool.query(
    `SELECT
       s."id",
       s."cohortId",
       s."intentStatus",
       s."name",
       s."city",
       s."hasVehicle",
       lc."id" AS "leadCohortId"
     FROM wa_bot_sessions s
     LEFT JOIN leads_cohort lc
       ON lc."phoneNumber" = s."phoneNumber"
      AND lc."cohortId"    = s."cohortId"
     WHERE (s."phoneNumber" = $1 OR s."phoneNumber" = $2)
       AND s."intentStatus" IN ('pending', 'interested')
     ORDER BY s."createdAt" DESC
     LIMIT 1`,
    [digits, local]
  );
  return rows[0] || null;
}

// ── Messages (append-only) ────────────────────────────────────────────────────

async function appendMessage(sessionId, role, content) {
  await pool.query(
    `INSERT INTO wa_bot_messages ("sessionId", "role", "content") VALUES ($1, $2, $3)`,
    [sessionId, role, content]
  );
}

async function getMessages(sessionId) {
  const { rows } = await pool.query(
    `SELECT "role", "content"
     FROM wa_bot_messages
     WHERE "sessionId" = $1
     ORDER BY "createdAt" ASC`,
    [sessionId]
  );
  return rows.map((r) => ({ role: r.role, content: r.content }));
}

// ── Session updates ───────────────────────────────────────────────────────────

async function updateSession(sessionId, { name, city, hasVehicle } = {}) {
  const updates = [`"updatedAt" = NOW()`];
  const values = [];
  let idx = 1;

  if (name !== undefined)       { updates.push(`"name" = $${idx}`);       values.push(name);       idx++; }
  if (city !== undefined)       { updates.push(`"city" = $${idx}`);       values.push(city);       idx++; }
  if (hasVehicle !== undefined) { updates.push(`"hasVehicle" = $${idx}`); values.push(hasVehicle); idx++; }

  values.push(sessionId);
  await pool.query(
    `UPDATE wa_bot_sessions SET ${updates.join(", ")} WHERE "id" = $${idx}`,
    values
  );
}

// ── Cohort ────────────────────────────────────────────────────────────────────

async function getCohortMessage(cohortId) {
  const { rows } = await pool.query(
    `SELECT "metaData"->>'message' AS message FROM cohorts WHERE "id" = $1`,
    [cohortId]
  );
  return rows[0]?.message || "Kya aap aaj bhi job dhoond rahe hain?";
}

// ── Close ─────────────────────────────────────────────────────────────────────

async function closeDb() {
  await pool.end();
}

module.exports = {
  getLeadsToPick,
  createSessionAndMarkPending,
  markIntent,
  getActiveSessionByPhone,
  getCohortMessage,
  appendMessage,
  getMessages,
  updateSession,
  closeDb,
};
