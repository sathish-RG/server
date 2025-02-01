import { Router } from "express";
import {
  createChannel,
  getChannelMessages,
  getUserChannels,
  addMember,
  updateMemberRole,
  setGroupPhoto,
  changeGroupName,
  removeMember,
} from "../controllers/ChannelControllers.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import { upload } from "../controllers/ChannelControllers.js";

const channelRoutes = Router();

// Create a new channel
channelRoutes.post("/create-channel", verifyToken, createChannel);

// Get all channels for the authenticated user
channelRoutes.get("/get-user-channels", verifyToken, getUserChannels);

// Get messages for a specific channel
channelRoutes.get("/get-channel-messages/:channelId", verifyToken, getChannelMessages);

// Add a member to a channel
channelRoutes.post("/add-member", verifyToken, addMember);

// Update a member's role in a channel
channelRoutes.put("/update-member-role", verifyToken, updateMemberRole);

// Set or update the group photo for a channel
channelRoutes.post("/set-group-photo", verifyToken, upload.single("photo"), setGroupPhoto);

// Change the name of a channel
channelRoutes.put("/change-group-name", verifyToken, changeGroupName);

// Remove a member from a channel
channelRoutes.delete("/remove-member", verifyToken, removeMember);

export default channelRoutes;