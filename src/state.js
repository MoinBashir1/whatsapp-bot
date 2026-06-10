"use strict";

// In-memory lead state for a single conversation.
// When we add Postgres later, this shape maps directly to a DB row.

function createLeadState() {
  return {
    name: null,
    interested: null,   // true | false | null
    city: null,
    has_vehicle: null,  // true | false | null
    done: false,
    end_reason: null,   // "completed" | "not_interested"
  };
}

// Apply a save_lead_info tool call payload to the state.
function applyLeadUpdate(state, update) {
  if (update.name !== undefined) state.name = update.name;
  if (update.interested !== undefined) state.interested = update.interested;
  if (update.city !== undefined) state.city = update.city;
  if (update.has_vehicle !== undefined) state.has_vehicle = update.has_vehicle;
}

// Return which of the 4 required fields are still missing.
function missingFields(state) {
  const fields = [];
  if (state.name === null) fields.push("name");
  if (state.interested === null) fields.push("interested");
  if (state.interested !== false) {
    // Only ask city/vehicle if they are interested
    if (state.city === null) fields.push("city");
    if (state.has_vehicle === null) fields.push("has_vehicle");
  }
  return fields;
}

// True when conversation should end (agent called end_conversation).
function isComplete(state) {
  return state.done;
}

module.exports = { createLeadState, applyLeadUpdate, missingFields, isComplete };
