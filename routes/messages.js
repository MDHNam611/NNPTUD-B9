var express = require("express");
var router = express.Router();
var messageModel = require("../schemas/messages");
var { checkLogin } = require("../utils/authHandler");
var { uploadImage } = require("../utils/upload");

// Lấy message cuối cùng của mỗi user mà user hiện tại nhắn tin hoặc user khác nhắn cho user hiện tại
// Thêm comment giải thích: Aggregation để lấy tin nhắn cuối cùng, nhóm theo ID người gửi hoặc nhận khác với currentUserId
router.get("/", checkLogin, async function(req, res, next) {
    try {
        let currentUserId = req.user._id;
        
        let latestMessages = await messageModel.aggregate([
            {
                $match: {
                    $or: [{ from: currentUserId }, { to: currentUserId }]
                }
            },
            {
                // Sắp xếp giảm dần theo thời gian tạo để tin nhắn mới nhất nằm đầu
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        // Xác định xem mình đang chat với ai, lưu vào _id
                        $cond: [
                            { $eq: ["$from", currentUserId] },
                            "$to",
                            "$from"
                        ]
                    },
                    // Lấy ra tin nhắn đầu tiên (chính là tin mới nhất vì đã sort)
                    latestMessage: { $first: "$$ROOT" }
                }
            }
        ]);
        
        res.status(200).send(latestMessages);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// Post nội dung bao gồm file hoặc text
// Thêm comment giải thích: Xử lý request dạng form-data vì có upload file (uploadImage.single('file'))
router.post("/", checkLogin, uploadImage.single('file'), async function(req, res, next) {
    try {
        let currentUserId = req.user._id;
        // Đọc ID người nhận (to) và text trong body
        let { to, text } = req.body;
        
        if (!to) {
            return res.status(400).send({ message: "Thiếu userID người nhận (to)" });
        }

        let type = "text";
        let messageText = text;

        // Nếu req có upload chứa file thì type là file, text là path dẫn đến file
        if (req.file) {
            type = "file";
            messageText = req.file.path.replace(/\\/g, '/'); // Chuẩn hóa đường dẫn phù hợp mọi hệ điều hành
        } else if (!text) {
            return res.status(400).send({ message: "Thiếu nội dung tin nhắn (text) hoặc file" });
        }

        // Tạo message mới để lưu vào mongodb
        let newMessage = new messageModel({
            from: currentUserId,
            to: to,
            messageContent: {
                type: type,
                text: messageText
            }
        });

        await newMessage.save();
        res.status(201).send(newMessage);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// Lấy toàn toàn bộ message from: user hiện tại đến userID và ngược lại
// Thêm comment giải thích: Tìm tất cả tin nhắn giao tiếp giữa currentUserId và userID, sắp xếp theo thứ tự cũ nhất -> mới nhất
router.get("/:userID", checkLogin, async function(req, res, next) {
    try {
        let currentUserId = req.user._id;
        let userID = req.params.userID;
        
        let messages = await messageModel.find({
            $or: [
                { from: currentUserId, to: userID },
                { from: userID, to: currentUserId }
            ]
        }).sort({ createdAt: 1 }); // Sắp xếp tăng dần theo thời gian tạo
        
        res.status(200).send(messages);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

module.exports = router;
