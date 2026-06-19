module.exports = function (app, message, stack, time) {
    return {
        "content": `There was an uncaught exception in your ${app} NodeAPI at ${time}`,
        "embeds": [
            {
                "title": message,
                "description": stack,
                "color": 16515072
            }
        ]
    }
}