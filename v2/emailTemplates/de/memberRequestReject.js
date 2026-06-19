module.exports = function (firstName, lastName, forumName, reason) {
    return {
        subject: "Deine Anfrage wurde abgelehnt",
        body: `<h1>Deine Anfrage, um der Gruppe ${forumName} beizutreten wurde abgelehnt.</h1>
                <p>Hey ${firstName} ${lastName},<br>
                du wurdest vom Gruppeninhaber der Gruppe ${forumName} aus folgendem Grund abgelehnt:<br>
                ${reason}<br>
                Liebe Grüße!,<br>
                Das ${process.env.REGION}-Team</p>`
    };
};
