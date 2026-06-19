module.exports = function (firstName, lastName, forumName, reason) {
    return {
        subject: "Your request has been accepted",
        body: `<h1>Your request to join ${forumName} has been accepted.</h1>
                <p>Dear ${firstName} ${lastName},<br>
                you have been rejected by the group owner of group ${forumName} for the following reason:<br>
                ${reason}<br>

                Thank you,<br>
                Heidi Team</p>`
    };
};
