"use strict";

require("dotenv").config();
const axios = require("axios");

const BASE_URL = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

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
  try {
    const res = await axios.post(BASE_URL, payload, { headers: headers() });
    return res.data;
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    throw new Error(detail);
  }
}

// Opens the conversation window using Meta's pre-approved hello_world template.
// Required for business-initiated messages — interactive/text messages are blocked otherwise.
async function sendOpeningTemplate(phoneNumber) {
  const to = formatPhone(phoneNumber);
  await post({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: { name: "hello_world", language: { code: "en_US" } },
  });
  console.log(`[whatsapp] → ${to} [template:hello_world]`);
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

module.exports = { sendOpeningTemplate, sendMessage, sendIntentButtons };
