'use strict';

const { Schema, model } = require('mongoose');

const messageSchema = new Schema(
  {
    role: {
      type: String,
      enum: ['user', 'bot'],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

module.exports = model('Message', messageSchema);
