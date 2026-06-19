module.exports = function (firstName, lastName, token, userId) {
    return {
        subject: "Dein Passwort wurde zurückgesetzt",
        body: `<h1>Dein Passwort wurde zurückgesetzt</h1>
                <p>Hey ${firstName} ${lastName},
                das Passwort für dein Konto wurde erfolgreich zurückgesetzt.<br>
                <a href="${process.env.WEBSITE_DOMAIN}/PasswordForgot?token=${token}&userId=${userId}">Passwort vergessen</a>
                <br>
                Viel Spaß,<br>
                Das ${process.env.REGION}-Team</p>`
    };
};
