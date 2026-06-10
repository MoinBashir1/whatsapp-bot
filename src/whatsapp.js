"use strict";

require("dotenv").config();
const axios = require("axios");

const BASE_URL = `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

const headers = () => ({
  Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
});

// Meta requires full international format without + (e.g. 916005812088)
function formatPhone(phoneNumber) {
  const digits = phoneNumber.replace(/\D/g, "");
  // Prepend 91 if it's a 10-digit Indian number
  return digits.length === 10 ? `91${digits}` : digits;
}

async function post(payload) {
  console.log(`[whatsapp] Sending to URL: ${BASE_URL}`);
  console.log(`[whatsapp] Token prefix: ${process.env.WHATSAPP_ACCESS_TOKEN?.slice(0, 20)}...`);
  console.log(`[whatsapp] Payload: ${JSON.stringify(payload)}`);
  try {
    const res = await axios.post(BASE_URL, payload, { headers: headers() });
    return res.data;
  } catch (err) {
    console.error(`[whatsapp] Raw error:`, JSON.stringify(err.response?.data || err.message));
    const detail = err.response?.data?.error?.message || err.message;
    throw new Error(detail);
  }
}

// Opens the conversation with the vahan_jobs template.
// This template includes the intent question + Yes/No buttons, so no separate cohort message is needed.
async function sendOpeningTemplate(phoneNumber) {
  const to = formatPhone(phoneNumber);
  await post({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: { name: "vahan_jobs", language: { code: "en" } },
  });
  console.log(`[whatsapp] → ${to} [template:vahan_jobs]`);
}

// Send a plain text message.
async function sendMessage(phoneNumber, text) {
  const to = formatPhone(phoneNumber);
  await post({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
  console.log(`[whatsapp] → ${to}: ${text}`);
}

// Send the intent question with Yes / No reply buttons.
async function sendIntentButtons(phoneNumber, text) {
  const to = formatPhone(phoneNumber);
  await post({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: [
          { type: "reply", reply: { id: "intent_yes", title: "Haan, job chahiye" } },
          { type: "reply", reply: { id: "intent_no",  title: "Nahi, shukriya"   } },
        ],
      },
    },
  });
  console.log(`[whatsapp] → ${to} [buttons]: ${text}`);
}

// Send the vehicle question with Yes / No reply buttons.
async function sendVehicleButtons(phoneNumber, text) {
  const to = formatPhone(phoneNumber);
  await post({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: [
          { type: "reply", reply: { id: "vehicle_yes", title: "Haan, hai mere paas" } },
          { type: "reply", reply: { id: "vehicle_no",  title: "Nahi, nahi hai"      } },
        ],
      },
    },
  });
  console.log(`[whatsapp] → ${to} [vehicle-buttons]: ${text}`);
}

module.exports = { sendOpeningTemplate, sendMessage, sendIntentButtons, sendVehicleButtons };
