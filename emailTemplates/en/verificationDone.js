module.exports = function (firstName, lastName) {
    return {
        subject: "Your email has been verified",
        body: `<h1>Your email has been verified</h1>
                <p>Dear ${firstName} ${lastName},<br>
                You have reset your succesfully verified your account. You can now login to your account.<br>
                <br>
                Thank you,<br>
                Heidi Team</p>`
    }
}