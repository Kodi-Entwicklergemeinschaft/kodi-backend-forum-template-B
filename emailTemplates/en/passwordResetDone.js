module.exports = function (firstName, lastName) {
    return {
        subject: "Your password has been reset",
        body: `<h1>Your password has been reset</h1>
                <p>Dear ${firstName} ${lastName},<br>
                You have reset your succesfully reset the password of your account.<br>
                <br>
                Thank you,<br>
                Heidi Team</p>`
    }
}