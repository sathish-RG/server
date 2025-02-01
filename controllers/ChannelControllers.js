import mongoose from "mongoose";
import Channel from "../model/ChannelModel.js";
import User from "../model/UserModel.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure upload directory
const uploadDir = path.join(__dirname, "../uploads/channels");

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log("Upload directory ready:", uploadDir);
  } catch (error) {
    console.error("Error creating upload directory:", error);
  }
};
ensureUploadDir();

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `channel-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Configure Multer upload
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed.'));
    }
  }
});

// Set Group Photo handler
export const setGroupPhoto = async (req, res) => {
  try {
    // Handle the file upload
    upload.single('photo')(req, res, async (err) => {
      if (err) {
        console.error("Upload error:", err);
        return res.status(400).json({
          message: err.message || "File upload failed"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "No file uploaded"
        });
      }

      const { channelId } = req.body;

      if (!channelId) {
        await fs.unlink(req.file.path);
        return res.status(400).json({
          message: "Channel ID is required"
        });
      }

      try {
        const channel = await Channel.findById(channelId);
        
        if (!channel) {
          await fs.unlink(req.file.path);
          return res.status(404).json({
            message: "Channel not found"
          });
        }

        // Check if user is admin
        if (channel.admin.toString() !== req.userId) {
          await fs.unlink(req.file.path);
          return res.status(403).json({
            message: "Only admin can change group photo"
          });
        }

        // Delete old photo if exists
        if (channel.photo) {
          const oldPath = path.join(__dirname, '..', channel.photo);
          try {
            await fs.unlink(oldPath);
          } catch (error) {
            console.error("Error deleting old photo:", error);
          }
        }

        // Update channel with new photo
        const relativePath = path.relative(
          path.join(__dirname, '..'),
          req.file.path
        ).replace(/\\/g, '/');

        channel.photo = relativePath;
        await channel.save();

        // Construct the full URL for the photo
        const photoUrl = `${process.env.HOST || 'http://localhost:8747'}/${relativePath}`;

        return res.status(200).json({
          message: "Group photo updated successfully",
          photoUrl
        });

      } catch (error) {
        // Clean up uploaded file on error
        if (req.file) {
          try {
            await fs.unlink(req.file.path);
          } catch (unlinkError) {
            console.error("Error deleting uploaded file:", unlinkError);
          }
        }
        
        console.error("Error in setGroupPhoto:", error);
        return res.status(500).json({
          message: "Internal server error"
        });
      }
    });
  } catch (error) {
    console.error("Error in setGroupPhoto outer try-catch:", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
};

// Create Channel
export const createChannel = async (req, res) => {
  try {
    const { name, members } = req.body;
    const userId = req.userId;

    // Validate admin user
    const admin = await User.findById(userId);
    if (!admin) {
      return res.status(400).json({ message: "Admin user not found." });
    }

    // Validate members
    const validMembers = await User.find({ _id: { $in: members } });
    if (validMembers.length !== members.length) {
      return res.status(400).json({ message: "Some members are not valid users." });
    }

    // Create new channel
    const newChannel = new Channel({
      name,
      members,
      admin: userId,
    });

    await newChannel.save();

    return res.status(201).json({ channel: newChannel });
  } catch (error) {
    console.error("Error creating channel:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get User Channels
export const getUserChannels = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);

    // Find channels where the user is either admin or member
    const channels = await Channel.find({
      $or: [{ admin: userId }, { members: userId }],
    }).sort({ updatedAt: -1 });

    return res.status(200).json({ channels });
  } catch (error) {
    console.error("Error getting user channels:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get Channel Messages
export const getChannelMessages = async (req, res) => {
  try {
    const { channelId } = req.params;

    // Find channel and populate messages with sender details
    const channel = await Channel.findById(channelId).populate({
      path: "messages",
      populate: {
        path: "sender",
        select: "firstName lastName email _id image color",
      },
    });

    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    return res.status(200).json({ messages: channel.messages });
  } catch (error) {
    console.error("Error getting channel messages:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Promote/Demote Members (Only Admin can promote/demote)
export const updateMemberRole = async (req, res) => {
  try {
    const { channelId, userId, role } = req.body;

    // Find channel
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    // Check if the requester is the admin
    if (channel.admin.toString() !== req.userId) {
      return res.status(403).json({ message: "Only the admin can update roles" });
    }

    // Check if the user is a member
    const isMember = channel.members.includes(userId);
    if (!isMember) {
      return res.status(404).json({ message: "User is not a member" });
    }

    // Update role (assuming role is either "admin" or "member")
    channel.admin = userId; // Promote to admin
    await channel.save();

    return res.status(200).json({ message: "Member role updated successfully", channel });
  } catch (error) {
    console.error("Error updating member role:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Change Group Name
export const changeGroupName = async (req, res) => {
  try {
    const { channelId, name } = req.body;

    // Find channel
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    // Check if the requester is the admin
    if (channel.admin.toString() !== req.userId) {
      return res.status(403).json({ message: "Only the admin can change the group name" });
    }

    // Update channel name
    channel.name = name;
    await channel.save();

    return res.status(200).json({ message: "Group name updated successfully", channel });
  } catch (error) {
    console.error("Error changing group name:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Add Member by Email
export const addMember = async (req, res) => {
  try {
    const { channelId, email } = req.body;

    // Find channel
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is already a member
    const isMember = channel.members.includes(user._id);
    if (isMember) {
      return res.status(400).json({ message: "User is already a member" });
    }

    // Add user to channel members
    channel.members.push(user._id);
    await channel.save();

    return res.status(200).json({ message: "Member added successfully", channel });
  } catch (error) {
    console.error("Error adding member:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Remove Member by Email
export const removeMember = async (req, res) => {
  try {
    const { channelId, email } = req.body;

    // Find channel
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is a member
    const isMember = channel.members.includes(user._id);
    if (!isMember) {
      return res.status(400).json({ message: "User is not a member" });
    }

    // Remove user from channel members
    channel.members = channel.members.filter((memberId) => memberId.toString() !== user._id.toString());
    await channel.save();

    return res.status(200).json({ message: "Member removed successfully", channel });
  } catch (error) {
    console.error("Error removing member:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Export the upload middleware for use in routes
export { upload };