"use strict";

// Terminal tester — simulates a WhatsApp conversation in your terminal.
// Run without DB:  node test.js
// Run with DB:     NODE_ENV=staging node test.js

const readline = require("readline");
const { runTurn } = require("./src/agent");
const { createLeadState, isComplete } = require("./src/state");

const TEST_PHONE = "test_9999999999";

async function main() {
  let db = null;
  let session = null;
  let history = [];
  let state = createLeadState();

  const fs = require("fs");
  const path = require("path");

  if (fs.existsSync(path.join(__dirname, "database.json"))) {
    console.log("[db] database.json found, connecting...");
    try {
      db = require("./src/db");
      console.log("[db] module loaded, querying...");
      session = await db.getSessionByPhone(TEST_PHONE);
      if (session) {
        history = await db.getMessages(session.id);
        state = Object.assign(createLeadState(), {
          name:         session.rider_name,
          interested:   session.intent === "pending" ? null : session.intent === "interested",
          city:         session.city,
          has_vehicle:  session.has_vehicle,
        });
        console.log(`[db] Resumed session ${session.id}`);
      } else {
        console.log("[db] No pending session found, creating new...");
        session = await db.createSession(TEST_PHONE);
        console.log(`[db] New session created: ${session.id}`);
      }
    } catch (err) {
      console.error("[db] FAILED:", err.message);
      console.warn("[db] Falling back to in-memory mode");
      db = null;
    }
  } else {
    console.log("[db] No database.json found — running in-memory");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  function printState() {
    console.log("\n--- Lead State ---");
    console.log(JSON.stringify(state, null, 2));
    console.log("------------------\n");
  }

  console.log("\n=== Vahan Bot Terminal Tester ===");
  console.log("Commands: 'quit' | 'state' | 'reset'\n");

  function ask() {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { ask(); return; }

      if (trimmed.toLowerCase() === "quit") {
        printState();
        if (db) await db.closeDb();
        rl.close();
        return;
      }

      if (trimmed.toLowerCase() === "state") {
        printState();
        ask();
        return;
      }

      if (trimmed.toLowerCase() === "reset") {
        history = [];
        state = createLeadState();
        if (db) {
          session = await db.createSession(TEST_PHONE);
          console.log(`[db] New session ${session.id}\n`);
        }
        ask();
        return;
      }

      let reply;
      try {
        ({ reply } = await runTurn(state, history, trimmed));
        console.log(`\nBot: ${reply}\n`);
      } catch (err) {
        console.error("[bot] Error calling OpenAI:", err.message);
        ask();
        return;
      }

      history.push({ role: "user", content: trimmed });
      history.push({ role: "assistant", content: reply });

      if (db && session) {
        try {
          await db.appendMessage(session.id, "user", trimmed);
          await db.appendMessage(session.id, "assistant", reply);
          await db.updateSession(session.id, {
            riderName:  state.name        || undefined,
            city:       state.city        || undefined,
            hasVehicle: state.has_vehicle ?? undefined,
            intent:     state.interested === true  ? "interested"
                      : state.interested === false ? "not_interested"
                      : undefined,
          });
          console.log(`[db] saved (session ${session.id})`);
        } catch (err) {
          console.error("[db] Failed to save messages:", err.message);
        }
      }

      if (isComplete(state)) {
        console.log(`\n[Conversation ended: ${state.end_reason}]`);
        printState();
        if (db) await db.closeDb();
        rl.close();
        return;
      }

      ask();
    });
  }

  ask();
}

main();
