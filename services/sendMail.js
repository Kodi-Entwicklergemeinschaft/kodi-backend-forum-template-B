const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    path: process.env.EMAIL_PATH,
    auth: {
        user: process.env.EMAIL_ID,
        pass: process.env.EMAIL_PASSWORD
    }
});

async function sendMail(to, subject, text, html) {
    const mailOptions = {
        from: process.env.EMAIL_ID,
        to,
        subject
    };
    if (text) {
        mailOptions.text = text;
    }
    if (html) {
        mailOptions.html = html;
    }
    return transporter.sendMail(mailOptions);
}

module.exports = sendMail