"use strict";

require("dotenv").config();
const db = require("./db");
const { sendOpeningTemplate } = require("./whatsapp");

const BATCH_SIZE = 50;
const DELAY_MS = 500; // 500ms between sends to avoid rate limits

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log(`[cron] Starting — ${new Date().toISOString()}`);

  let leads;
  try {
    leads = await db.getLeadsToPick(BATCH_SIZE);
  } catch (err) {
    console.error("[cron] Failed to fetch leads:", err.message);
    process.exit(1);
  }

  if (!leads.length) {
    console.log("[cron] No to_be_picked leads found.");
    process.exit(0);
  }

  console.log(`[cron] Processing ${leads.length} leads`);

  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    try {
      const sessionId = await db.createSessionAndMarkPending(lead);
      await sendOpeningTemplate(lead.phoneNumber);
      await db.appendMessage(sessionId, "assistant", "vahan_jobs_template_sent");
      sent++;
      console.log(`[cron] ✓ (${sent}/${leads.length}) ${lead.phoneNumber}`);
    } catch (err) {
      failed++;
      console.error(`[cron] ✗ ${lead.phoneNumber}:`, err.message);
    }

    await sleep(DELAY_MS);
  }

  console.log(`[cron] Done — ${sent} sent, ${failed} failed.`);
  process.exit(0);
}

run();
