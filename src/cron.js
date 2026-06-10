"use strict";

require("dotenv").config();
const db = require("./db");
const { sendOpeningTemplate } = require("./whatsapp");

const BATCH_SIZE = 50;
const DELAY_BETWEEN_MESSAGES_MS = 500;  // between each message within a batch
const DELAY_BETWEEN_BATCHES_MS  = 5000; // 5s pause between batches

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log(`[cron] Starting one-time run — ${new Date().toISOString()}`);

  let leads;
  try {
    leads = await db.getLeadsToPick(10000); // fetch all to_be_picked leads
  } catch (err) {
    console.error("[cron] Failed to fetch leads:", err.message);
    process.exit(1);
  }

  if (!leads.length) {
    console.log("[cron] No to_be_picked leads found.");
    process.exit(0);
  }

  console.log(`[cron] ${leads.length} leads to process in batches of ${BATCH_SIZE}`);

  let sent = 0;
  let failed = 0;

  // Split into batches of BATCH_SIZE
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(leads.length / BATCH_SIZE);

    console.log(`[cron] Batch ${batchNum}/${totalBatches} — ${batch.length} leads`);

    for (const lead of batch) {
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

      await sleep(DELAY_BETWEEN_MESSAGES_MS);
    }

    // Pause between batches (skip after the last one)
    if (i + BATCH_SIZE < leads.length) {
      console.log(`[cron] Batch ${batchNum} done. Waiting ${DELAY_BETWEEN_BATCHES_MS / 1000}s before next batch...`);
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log(`[cron] Done — ${sent} sent, ${failed} failed.`);
  process.exit(0);
}

run();
