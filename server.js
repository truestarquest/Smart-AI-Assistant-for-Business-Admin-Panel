'use strict';

require('dotenv').config();

const path     = require('path');
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const { startBot } = require('./src/bot');

const PORT        = process.env.PORT        || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-assistant';
const NODE_ENV    = process.env.NODE_ENV    || 'development';

const app = express();

app.use(cors({
    origin: NODE_ENV === 'production' ? process.env.ALLOWED_ORIGIN : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
    const dbState = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    res.json({
          success: true,
          message: 'AI Assistant API is running',
          environment: NODE_ENV,
          timestamp: new Date().toISOString(),
          database: { status: dbState[mongoose.connection.readyState] || 'unknown' },
          version: require('./package.json').version,
    });
});

app.use('/api/chat',  require('./src/routes/chat'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/users', require('./src/routes/users'));

app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[Error]', err.message);
    res.status(err.status || 500).json({
          success: false,
          message: NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    });
});

async function start() {
    try {
          await mongoose.connect(MONGODB_URI);
          console.log(`MongoDB connected: ${MONGODB_URI}`);
    } catch (err) {
          console.warn(`MongoDB not connected (${err.message}). Starting without DB.`);
    }
    startBot();
    app.listen(PORT, () => {
          console.log(`Server: http://localhost:${PORT}`);
          console.log(`Status: http://localhost:${PORT}/api/status`);
    });
}

start();
