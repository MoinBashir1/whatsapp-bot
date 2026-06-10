"use strict";

require("dotenv").config();
const cron = require("node-cron");
const db = require("./db");
const { sendOpeningTemplate } = require("./whatsapp");

const BATCH_SIZE = 50;
const DELAY_MS = 500; // between messages to avoid rate limits

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBatch() {
  console.log(`[cron] Running batch — ${new Date().toISOString()}`);

  let leads;
  try {
    leads = await db.getLeadsToPick(BATCH_SIZE);
  } catch (err) {
    console.error("[cron] Failed to fetch leads:", err.message);
    return;
  }

  if (!leads.length) {
    console.log("[cron] No to_be_picked leads found.");
    return;
  }

  console.log(`[cron] Processing ${leads.length} leads`);

  for (const lead of leads) {
    try {
      // 1. Create session + mark both tables as pending in one transaction.
      const sessionId = await db.createSessionAndMarkPending(lead);

      // 2. Send hello_world template to open the conversation window.
      // The actual cohort question is sent when user replies (in webhook.js).
      await sendOpeningTemplate(lead.phoneNumber);

      // 3. Save template send as first assistant message.
      await db.appendMessage(sessionId, "assistant", "hello_world_template_sent");

      console.log(`[cron] ✓ ${lead.phoneNumber} — session ${sessionId}`);
    } catch (err) {
      console.error(`[cron] ✗ ${lead.phoneNumber}:`, err.message);
    }

    await sleep(DELAY_MS);
  }

  console.log("[cron] Batch done.");
}

// Run immediately on start, then every 15 minutes.
runBatch();
cron.schedule("*/15 * * * *", runBatch);

console.log("[cron] Scheduler started — runs every 15 minutes.");
