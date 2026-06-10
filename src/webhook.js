"use strict";

require("dotenv").config();
const db = require("./db");
const { classifyIntent } = require("./intentClassifier");
const { runTurn } = require("./agent");
const { sendMessage, sendVehicleButtons } = require("./whatsapp");
const { createLeadState, missingFields } = require("./state");

// Main entry point called for every inbound WhatsApp message.
// phoneNumber: "919876543210"
// userMessage: text the rider sent
async function processInbound(phoneNumber, userMessage) {
  console.log(`[webhook] ← ${phoneNumber}: ${userMessage}`);

  // 1. Find the active session for this number.
  const session = await db.getActiveSessionByPhone(phoneNumber);
  if (!session) {
    console.log(`[webhook] No active session for ${phoneNumber} — ignoring`);
    return;
  }

  // 2. Save the incoming user message.
  await db.appendMessage(session.id, "user", userMessage);

  // ── Intent reply: vahan_job_outreach template already shows the intent question + buttons ──
  // So the very FIRST reply from the user is the intent answer (button tap or text).
  if (session.intentStatus === "pending") {
    const intent = await classifyIntent(userMessage);
    console.log(`[webhook] Intent for ${phoneNumber}: ${intent}`);

    // Update both wa_bot_sessions and leads_cohort atomically.
    await db.markIntent(session.id, session.leadCohortId, intent);

    if (intent === "not_interested") {
      const reply = "Theek hai! Agar kabhi job ki zaroorat ho toh hume zaroor batayein. All the best! 😊";
      await sendMessage(phoneNumber, reply);
      await db.appendMessage(session.id, "assistant", reply);
      return;
    }

    // Interested — ask for name to start info collection.
    const reply = "Bahut accha! 😊 Aapka naam kya hai? Hum jaldi aapko ek acchi job se connect karenge!";
    await sendMessage(phoneNumber, reply);
    await db.appendMessage(session.id, "assistant", reply);
    return;
  }

  // ── Subsequent replies: collect name / city / vehicle ────────────────────
  if (session.intentStatus === "interested") {
    const rawHistory = await db.getMessages(session.id);
    // Strip internal marker messages before passing to the LLM
    const history = rawHistory.filter(m => m.content !== "vahan_jobs_template_sent");

    // Rebuild lead state from session row.
    const state = Object.assign(createLeadState(), {
      name:        session.name,
      interested:  true,
      city:        session.city,
      has_vehicle: session.hasVehicle,
    });

    const { reply } = await runTurn(state, history, userMessage);

    // If vehicle is the only field still missing, send MCQ buttons instead of plain text.
    const stillMissing = missingFields(state);
    if (stillMissing.length === 1 && stillMissing[0] === "has_vehicle") {
      await sendVehicleButtons(phoneNumber, reply);
    } else {
      await sendMessage(phoneNumber, reply);
    }
    await db.appendMessage(session.id, "assistant", reply);

    // Persist any newly collected fields.
    await db.updateSession(session.id, {
      name:       state.name       || undefined,
      city:       state.city       || undefined,
      hasVehicle: state.has_vehicle ?? undefined,
    });
    return;
  }

  console.log(`[webhook] Session ${session.id} already closed (${session.intentStatus})`);
}

module.exports = { processInbound };
