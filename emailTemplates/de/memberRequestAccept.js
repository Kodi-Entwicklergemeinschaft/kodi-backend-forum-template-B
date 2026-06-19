module.exports = function (firstName, lastName, forumName) {
    return {
        subject: "Deine Anfrage wurde angenommen",
        body: `<h1>Deine Anfrage, ${forumName} beizutreten, wurde angenommen.</h1>
                <p>Hey ${firstName} ${lastName},<br>
                Du wurdest im Forum ${forumName} akzeptiert.<br>
                <br>
                Viel Spaß,<br>
                Das ${process.env.REGION}-Team</p>`
    }
}