"use strict";

require("dotenv").config();
const OpenAI = require("openai");
const { TOOLS } = require("./tools");
const { applyLeadUpdate, missingFields } = require("./state");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a warm, friendly job recruiter for Vahan Jobs talking to a lead on WhatsApp.

Your goal is to collect 4 pieces of information:
1. Their name
2. Whether they are interested in finding a job right now (yes / no)
3. Which city or area they want to work in
4. Whether they have a bike or scooter (yes / no)

HOW TO BEHAVE:
- On the very first message: greet them warmly and introduce yourself as a Vahan recruiter.
- Ask ONE question at a time. Never ask two questions in the same message.
- As soon as the user shares any information (name, interest, city, vehicle), call save_lead_info immediately with whatever they shared. Do this before replying.
- Never ask for something they already told you.
- If they say they are not interested: thank them warmly, say goodbye, then call end_conversation with reason "not_interested".
- Once all 4 fields are collected: send a closing message — "Thanks [name]! Our team will call you within 24 hours. Please keep your phone handy." — then call end_conversation with reason "completed".
- Keep replies SHORT: 1-3 sentences only. This is WhatsApp.
- Always reply in Hinglish only (mix of Hindi and English) — regardless of what language the user writes in.
- Be human and warm. No corporate tone. No bullet points in replies.`;

// Build a state-aware system prompt so the agent always knows what's collected.
function buildSystemMessage(state) {
  const missing = missingFields(state);
  const collected = [];
  if (state.name) collected.push(`name: ${state.name}`);
  if (state.interested !== null) collected.push(`interested: ${state.interested}`);
  if (state.city) collected.push(`city: ${state.city}`);
  if (state.has_vehicle !== null) collected.push(`has_vehicle: ${state.has_vehicle}`);

  const statusLines = [
    `Already collected: ${collected.length ? collected.join(", ") : "nothing yet"}`,
    `Still needed: ${missing.length ? missing.join(", ") : "nothing — all done"}`,
  ].join("\n");

  return `${SYSTEM_PROMPT}\n\nCURRENT LEAD STATE:\n${statusLines}`;
}

// Execute a tool call and update state. Returns the tool result string.
function executeTool(toolCall, state) {
  const args = JSON.parse(toolCall.function.arguments);

  if (toolCall.function.name === "save_lead_info") {
    applyLeadUpdate(state, args);
    return { ok: true, state: { name: state.name, interested: state.interested, city: state.city, has_vehicle: state.has_vehicle } };
  }

  if (toolCall.function.name === "end_conversation") {
    state.done = true;
    state.end_reason = args.reason;
    return { ok: true, ended: true, reason: args.reason };
  }

  return { ok: false, error: "Unknown tool" };
}

// Run one turn of the agentic loop.
// history: array of { role, content } messages (excludes system prompt).
// Returns { reply: string, state: updated state }.
async function runTurn(state, history, userMessage) {
  const messages = [
    { role: "system", content: buildSystemMessage(state) },
    ...history,
    { role: "user", content: userMessage },
  ];

  // Agentic loop: keep going until the model produces a plain text reply.
  while (true) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: TOOLS,
      temperature: 0.7,
    });

    const choice = response.choices[0];
    messages.push(choice.message); // add assistant turn to messages

    // Plain text reply — we're done for this turn.
    if (choice.finish_reason === "stop") {
      return { reply: choice.message.content, state };
    }

    // The agent called one or more tools — execute them all.
    if (choice.finish_reason === "tool_calls") {
      for (const toolCall of choice.message.tool_calls) {
        const result = executeTool(toolCall, state);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      // Loop back — the agent will now produce a reply (or call more tools).
      continue;
    }

    // Unexpected finish reason — bail out.
    break;
  }

  return { reply: "(no response)", state };
}

module.exports = { runTurn };
