import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import helmet from "helmet";
import compression from "compression";
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

// Validate required environment variables
const validateEnv = () => {
  const required = ["DATABASE_URL", "PORT", "JWT_KEY", "NODE_ENV", "ORIGIN"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("Missing environment variables:", missing.join(", "));
    process.exit(1);
  }
};

// Setup directories for uploads/logs
const setupDirectories = async () => {
  const dirs = [
    path.join(__dirname, "uploads"),
    path.join(__dirname, "uploads/channels"),
    path.join(__dirname, "uploads/profiles"),
    path.join(__dirname, "logs"),
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
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  }
};

// Initialize Express app
const app = express();

// Security middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Setup CORS properly
const allowedOrigins = [
  process.env.ORIGIN, // From .env file (e.g., Netlify URL)
  "https://spectacular-horse-0f5464.netlify.app/auth", // Local development
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS Not Allowed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Other middlewares
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Serve static uploads
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "1d",
    etag: true,
    setHeaders: (res) => {
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Cache-Control", "public, max-age=86400");
    },
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/contacts", contactsRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/channel", channelRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : "Internal Server Error",
  });
});

// Start server
const startServer = async () => {
  try {
    validateEnv();
    await setupDirectories();
    await connectDB();

    const server = app.listen(process.env.PORT, () => {
      console.log(`🚀 Server running on port ${process.env.PORT}`);
    });

    setupSocket(server);
  } catch (error) {
    console.error("❌ Server Startup Error:", error);
    process.exit(1);
  }
};

startServer();
