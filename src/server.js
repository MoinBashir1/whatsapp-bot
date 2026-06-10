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

  console.log("[server] POST /webhook body:", JSON.stringify(req.body, null, 2));

  try {
    const entry  = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    console.log("[server] change:", JSON.stringify(change, null, 2));

    // Ignore delivery receipts and other non-message events.
    if (!change?.messages) {
      console.log("[server] No messages field — ignoring (likely a status/delivery event)");
      return;
    }

    const message     = change.messages[0];
    const phoneNumber = message.from;
    const msgType     = message.type;

    console.log(`[server] Message from ${phoneNumber}, type: ${msgType}`);

    let userText;

    if (msgType === "text") {
      userText = message.text.body;
    } else if (msgType === "interactive") {
      // Interactive reply buttons (sent by us with sendIntentButtons/sendVehicleButtons)
      const buttonReply = message.interactive?.button_reply;
      userText = buttonReply?.title || buttonReply?.id;
      console.log(`[server] Interactive button — id: ${buttonReply?.id}, title: ${buttonReply?.title}`);
    } else if (msgType === "button") {
      // Template quick reply buttons (vahan_jobs template)
      userText = message.button?.text || message.button?.payload;
      console.log(`[server] Template button — text: ${message.button?.text}`);
    } else {
      console.log(`[server] Unsupported message type: ${msgType} — ignoring`);
      return;
    }

    console.log(`[server] Passing to processInbound: ${phoneNumber} → "${userText}"`);
    await processInbound(phoneNumber, userText);
  } catch (err) {
    console.error("[server] Error processing inbound:", err.message);
    if (err.response?.data) console.error("[server] Meta error detail:", JSON.stringify(err.response.data));
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
