"use strict";

// Tool definitions — the agent calls these to save lead data and end the conversation.
// Using OpenAI function calling so state is explicit, not guessed from text.

const TOOLS = [
  {
    type: "function",
    function: {
      name: "save_lead_info",
      description:
        "Call this immediately whenever the user shares any of: their name, job interest (yes/no), city/area, or whether they have a bike/scooter. Call it as soon as the info is in their message — don't wait until the end.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The lead's name if they shared it",
          },
          interested: {
            type: "boolean",
            description:
              "true if they want a job, false if they said not interested",
          },
          city: {
            type: "string",
            description: "City or area they want to work in",
          },
          has_vehicle: {
            type: "boolean",
            description:
              "true if they have a bike/scooter, false if they don't",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "end_conversation",
      description:
        "Call this when the conversation should end — either all 4 fields are collected, or the lead said they are not interested.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: ["completed", "not_interested"],
            description:
              "'completed' when all 4 fields collected. 'not_interested' when lead said no.",
          },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  },
];

module.exports = { TOOLS };
