module.exports = function (firstName, lastName, forumName) {
    return {
        subject: "Your request has been accepted",
        body: `<h1>Your request to join ${forumName} has been accepted.</h1>
                <p>Dear ${firstName} ${lastName},<br>
                You have been accepted to the forum ${forumName}.<br>
                <br>
                Thank you,<br>
                Heidi Team</p>`
    };
};
