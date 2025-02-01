// config.js
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const config = {
  port: process.env.PORT || 8747,
  databaseURL: process.env.DATABASE_URL,
  origin: process.env.ORIGIN || "http://localhost:5173",
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // MongoDB options
  mongooseOptions: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  },
  
  // CORS options
  corsOptions: {
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  },
};

export default config;