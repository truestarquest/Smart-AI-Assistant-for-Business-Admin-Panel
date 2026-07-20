'use strict';

const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

module.exports = model('User', userSchema);
