module.exports = function (firstName, lastName, token, userId, lang) {
    return {
        subject: "Verify your email",
        body: `<h1>Verify your email</h1>
                <p>Dear ${firstName} ${lastName},<br>
                Thanks for registering with us. In order to proceed, you have to verify your email. Please click on the link to continue with your verification<br>
                <a href="${process.env.WEBSITE_DOMAIN}/VerifyEmail?token=${token}&userId=${userId}&lang=${lang}">Verify email link</a>
                <br>
                Thank you,<br>
                Heidi Team</p>`
    }
}