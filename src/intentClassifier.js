"use strict";

require("dotenv").config();
const OpenAI = require("openai");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT = `You determine if a person is interested in a job based on their WhatsApp reply.
Return ONLY one word: "interested" or "not_interested".
The reply may be in Hindi, Hinglish, or English.

Examples:
"haan"        → interested
"ha ji"       → interested
"yes"         → interested
"bilkul"      → interested
"chahiye"     → interested
"nahi"        → not_interested
"no"          → not_interested
"nai chahiye" → not_interested
"abhi nahi"   → not_interested`;

async function classifyIntent(userMessage) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const result = response.choices[0].message.content.trim().toLowerCase();
  return result === "interested" ? "interested" : "not_interested";
}

module.exports = { classifyIntent };
