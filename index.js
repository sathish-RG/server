import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import helmet from 'helmet';
import compression from 'compression';
import authRoutes from "./routes/AuthRoutes.js";
import contactsRoutes from "./routes/ContactRoutes.js";
import messagesRoutes from "./routes/MessagesRoute.js";
import setupSocket from "./socket.js";
import channelRoutes from "./routes/ChannelRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Validate environment variables
const validateEnv = () => {
  const required = [
    'DATABASE_URL',
    'PORT',
    'JWT_KEY',
    'NODE_ENV',
    'ORIGIN'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Required environment variables are missing:', missing.join(', '));
    console.error('Current environment:', {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL ? '[SET]' : '[NOT SET]',
      ORIGIN: process.env.ORIGIN,
    });
    process.exit(1);
  }
};

// Setup directories
const setupDirectories = async () => {
  const dirs = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'uploads/channels'),
    path.join(__dirname, 'uploads/profiles'),
    path.join(__dirname, 'logs')
  ];

  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`Directory ensured: ${dir}`);
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error);
      process.exit(1);
    }
  }
};

// MongoDB connection
const connectDB = async (retries = 5) => {
  const mongooseOptions = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10'),
    connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT || '10000'),
  };

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`MongoDB connection attempt ${i + 1}/${retries}`);
      await mongoose.connect(process.env.DATABASE_URL, mongooseOptions);
      console.log('MongoDB Connected Successfully');
      return true;
    } catch (error) {
      console.error(`Connection attempt ${i + 1} failed:`, error.message);
      if (i === retries - 1) throw error;
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Initialize Express app
const initializeApp = () => {
  const app = express();

  // Security middlewares
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  
  // CORS configuration
  app.use(cors({
    origin: process.env.ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 600
}));

  // General middlewares
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Serve static files
  app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
    maxAge: '1d',
    etag: true,
    setHeaders: (res) => {
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Cache-Control', 'public, max-age=86400');
    }
  }));

  // Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/contacts", contactsRoutes);
  app.use("/api/messages", messagesRoutes);
  app.use("/api/channel", channelRoutes);

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
      message: 'Something went wrong!',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
    });
  });

  return app;
};

// Graceful shutdown handler
const gracefulShutdown = async (server) => {
  console.log('\nInitiating graceful shutdown...');
  
  try {
    // Close HTTP server
    await new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });
    console.log('HTTP server closed');

    // Close MongoDB connection
    await mongoose.connection.close(false);
    console.log('MongoDB connection closed');

    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  try {
    // Initial setup
    validateEnv();
    await setupDirectories();
    await connectDB();

    const app = initializeApp();
    
    // Start HTTP server
    const server = app.listen(process.env.PORT, () => {
      const startTime = new Date().toISOString();
      console.log(`
Server Information:
------------------
Start Time: ${startTime}
Port: ${process.env.PORT}
Environment: ${process.env.NODE_ENV}
MongoDB: Connected
Node.js Version: ${process.version}
Platform: ${process.platform}
`);
    });

    // Setup WebSocket
    setupSocket(server);

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      gracefulShutdown(server);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown(server);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the application
startServer().catch(error => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
