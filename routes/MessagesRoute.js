import { Router } from "express";
import { getMessages, uploadFile, deleteMessage, editMessage } from "../controllers/MessagesController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import multer from "multer";

const messagesRoutes = Router();
const upload = multer({ dest: "uploads/files/" });

// Routes
messagesRoutes.post("/get-messages", verifyToken, getMessages);
messagesRoutes.post("/upload-file", verifyToken, upload.single("file"), uploadFile);
messagesRoutes.delete("/delete-message/:messageId", verifyToken, deleteMessage);
messagesRoutes.put("/edit-message/:messageId", verifyToken, editMessage);

export default messagesRoutes;
