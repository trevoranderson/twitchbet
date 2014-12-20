module.exports = {
    account: {
        nick: "Amiibet",
        password: "",
    },
    channel: "#shawnuffian",
    // People who are allowed to issue commands to the bot
    controllers: {
        "amiibofighter": true,
        "shawnuffian": true,
    },
    dburl: 'mongodb://localhost/betbot',
    coinAcc: {
        frequency: 5000,// how often to update in MS
        amount: 15, //how many to add
        firstTimeBonus: 0, // how many do new users start out with?
    },
    coinsCommandFreq: 10000, // How often to allow the !coins command to go through
    minbet: 15,
}