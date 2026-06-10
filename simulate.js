"use strict";

// Simulates the full flow end-to-end:
// 1. Cron picks leads and sends first message
// 2. You reply as the rider
// Run: node simulate.js

require("dotenv").config();
const readline = require("readline");
const db = require("./src/db");
const { getLeadsToPick, createSessionAndMarkPending, appendMessage } = db;
const { sendIntentButtons } = require("./src/whatsapp");
const { processInbound } = require("./src/webhook");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function main() {
  console.log("=== Full Flow Simulation ===\n");

  // Step 1: Pick one lead (like the cron does).
  const leads = await getLeadsToPick(1);
  if (!leads.length) {
    console.log("No to_be_picked leads found. Add one to leads_cohort first.");
    rl.close();
    return;
  }

  const lead = leads[0];
  console.log(`[sim] Picked lead: ${lead.name} (${lead.phoneNumber})\n`);

  // Step 2: Create session + mark pending.
  const sessionId = await createSessionAndMarkPending(lead);

  // Step 3: Send cohort's first message (with buttons).
  await sendIntentButtons(lead.phoneNumber, lead.cohortMessage);
  await appendMessage(sessionId, "assistant", lead.cohortMessage);

  console.log(`\n[sim] Session ${sessionId} created. Now reply as the rider.\n`);

  // Step 4: Simulate rider replies.
  function ask() {
    rl.question("Rider: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed.toLowerCase() === "quit") {
        rl.close();
        await db.closeDb();
        return;
      }

      await processInbound(lead.phoneNumber, trimmed);
      ask();
    });
  }

  ask();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
