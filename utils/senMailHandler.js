const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 25,
    secure: false, 
    auth: {
        user: "36dfdbd410f7c7", 
        pass: "631f8793333590", 
    },
});

module.exports = {
    // Hàm cũ của bạn (để reset password)
    sendMail: async function (to, url) {
        const info = await transporter.sendMail({
            from: 'admin@hehehe.com',
            to: to,
            subject: "reset pass",
            text: "click vo day de doi pass", 
            html: "click vo <a href="+url+">day</a> de doi pass", 
        });
    },
    // HÀM MỚI: Dùng để gửi mật khẩu dạng text cho user vừa import
    sendPasswordMail: async function (to, password) {
        const info = await transporter.sendMail({
            from: 'admin@hehehe.com',
            to: to,
            subject: "Thông tin tài khoản mới của bạn",
            text: `Chào bạn, mật khẩu đăng nhập tài khoản của bạn là: ${password}`, 
            html: `Chào bạn, mật khẩu đăng nhập tài khoản của bạn là: <strong>${password}</strong>`, 
        });
    }
}