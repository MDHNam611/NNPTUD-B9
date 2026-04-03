const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        from: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true
        },
        to: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true
        },
        messageContent: {
            type: {
                type: String,
                enum: ['text', 'file'],
                required: true,
                default: 'text'
            },
            text: {
                type: String,
                required: true
            }
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("message", messageSchema);
