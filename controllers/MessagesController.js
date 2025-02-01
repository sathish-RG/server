import Message from "../model/MessagesModel.js";
import { promises as fs } from 'fs';
import path from 'path';

// Get messages between two users
export const getMessages = async (req, res) => {
  try {
    const user1 = req.userId;
    const user2 = req.body.id;

    if (!user1 || !user2) {
      return res.status(400).send("Both user IDs are required.");
    }

    const messages = await Message.find({
      $or: [
        { sender: user1, recipient: user2 },
        { sender: user2, recipient: user1 },
      ],
      deleted: false, // Exclude deleted messages
    }).sort({ timestamp: 1 });

    return res.status(200).json({ messages });
  } catch (err) {
    console.log(err);
    return res.status(500).send("Internal Server Error");
  }
};

// Upload a file
export const uploadFile = async (request, response) => {
  try {
    if (request.file) {
      const date = Date.now();
      let fileDir = `uploads/files/${date}`;
      let fileName = `${fileDir}/${path.basename(request.file.originalname)}`;

      // Create directory if it doesn't exist
      await fs.mkdir(fileDir, { recursive: true });

      // Use asynchronous file renaming
      await fs.rename(request.file.path, fileName);

      return response.status(200).json({ filePath: fileName });
    } else {
      return response.status(404).send("File is required.");
    }
  } catch (error) {
    console.error("File upload error:", error); // Log detailed error
    return response.status(500).send("Internal Server Error.");
  }
};

// Delete a message (soft delete)
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    if (!messageId) {
      return res.status(400).json({ message: 'Message ID is required' });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check permissions
    if (message.sender.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }

    // Soft delete
    message.deleted = true;
    await message.save();

    return res.status(200).json({
      message: 'Message deleted successfully',
      messageId
    });
  } catch (error) {
    console.error('Delete message error:', error);
    return res.status(500).json({
      message: 'Failed to delete message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Edit a message
export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { newContent } = req.body;
    const userId = req.userId;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).send("Message not found.");
    }

    // Check if the user is the sender or an admin
    if (message.sender.toString() !== userId && !req.isAdmin) {
      return res.status(403).send("You are not authorized to edit this message.");
    }

    // Update the message content
    message.content = newContent;
    message.edited = true;
    await message.save();

    return res.status(200).json({ message: "Message edited successfully." });
  } catch (err) {
    console.log(err);
    return res.status(500).send("Internal Server Error");
  }
};

// Pin a message
export const pinMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).send("Message not found.");
    }

    // Check if the user is an admin
    if (!req.isAdmin) {
      return res.status(403).send("You are not authorized to pin this message.");
    }

    // Prevent pinning if already pinned
    if (message.pinned) {
      return res.status(400).send("Message is already pinned.");
    }

    // Pin the message
    message.pinned = true;
    await message.save();

    return res.status(200).json({ message: "Message pinned successfully." });
  } catch (err) {
    console.log(err);
    return res.status(500).send("Internal Server Error");
  }
};
