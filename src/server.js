"use strict";

require("dotenv").config();
const express = require("express");
const { processInbound } = require("./webhook");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ── Webhook verification (Meta calls this GET when you register the webhook) ──
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("[server] Webhook verified by Meta");
    return res.status(200).send(challenge);
  }

  console.warn("[server] Webhook verification failed");
  res.sendStatus(403);
});

// ── Inbound messages (Meta POSTs here when a user sends a WhatsApp message) ──
app.post("/webhook", async (req, res) => {
  // Always respond 200 immediately — Meta retries if it doesn't get 200 fast.
  res.sendStatus(200);

  try {
    const entry  = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    // Ignore delivery receipts and other non-message events.
    if (!change?.messages) return;

    const message     = change.messages[0];
    const phoneNumber = message.from;
    const msgType     = message.type;

    let userText;

    if (msgType === "text") {
      userText = message.text.body;
    } else if (msgType === "interactive") {
      // User tapped a reply button — use button ID for reliable intent detection.
      const buttonId = message.interactive?.button_reply?.id;
      userText = buttonId === "intent_yes" ? "haan" : "nahi";
    } else {
      // Ignore images, audio, documents, etc. for now.
      return;
    }

    await processInbound(phoneNumber, userText);
  } catch (err) {
    console.error("[server] Error processing inbound:", err.message);
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
