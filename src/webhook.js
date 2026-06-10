"use strict";

require("dotenv").config();
const db = require("./db");
const { classifyIntent } = require("./intentClassifier");
const { runTurn } = require("./agent");
const { sendMessage, sendIntentButtons } = require("./whatsapp");
const { createLeadState } = require("./state");

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

  // ── First reply: send cohort question with buttons, then classify intent ──
  if (session.intentStatus === "pending") {
    const history = await db.getMessages(session.id);
    // We already saved the user message above, so first reply = exactly 1 user message in history.
    const isFirstReply = history.filter(m => m.role === "user").length === 1;

    // First user reply to hello_world template → send actual cohort question with buttons.
    if (isFirstReply) {
      const cohortMsg = await db.getCohortMessage(session.cohortId);
      await sendIntentButtons(phoneNumber, cohortMsg);
      await db.appendMessage(session.id, "assistant", cohortMsg);
      return;
    }

    // Second user reply → this is the intent answer (Yes/No button tap or text).
    const intent = await classifyIntent(userMessage);
    console.log(`[webhook] Intent for ${phoneNumber}: ${intent}`);

    // Update both tables atomically.
    await db.markIntent(session.id, session.leadCohortId, intent);

    if (intent === "not_interested") {
      const reply = "Shukriya! Agar kabhi job ki zaroorat ho toh hume zaroor batayein. All the best! 😊";
      await sendMessage(phoneNumber, reply);
      await db.appendMessage(session.id, "assistant", reply);
      return;
    }

    // Interested — greet and start collecting info.
    const reply = "Bahut accha! 😊 Aapka naam kya hai? Hum jaldi aapko ek acchi job se connect karenge!";
    await sendMessage(phoneNumber, reply);
    await db.appendMessage(session.id, "assistant", reply);
    return;
  }

  // ── Subsequent replies: collect name / city / vehicle ────────────────────
  if (session.intentStatus === "interested") {
    const history = await db.getMessages(session.id);

    // Rebuild lead state from session row.
    const state = Object.assign(createLeadState(), {
      name:        session.name,
      interested:  true,
      city:        session.city,
      has_vehicle: session.hasVehicle,
    });

    const { reply } = await runTurn(state, history, userMessage);
    await sendMessage(phoneNumber, reply);
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
