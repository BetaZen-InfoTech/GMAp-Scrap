'use strict';

const mongoose = require('mongoose');
const { MONGODB_URI } = require('./config');

let connected = false;
let connecting = null;

async function connectDB() {
  if (connected) return mongoose.connection;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      mongoose.set('strictQuery', true);
      const conn = await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 15000,
        maxPoolSize: 10,
      });
      connected = true;
      return conn.connection;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

async function disconnectDB() {
  if (!connected) return;
  try {
    await mongoose.disconnect();
  } finally {
    connected = false;
  }
}

module.exports = { connectDB, disconnectDB, mongoose };
