var mongoose = require('mongoose');
// define the schema for our channel model
var channelSchema = mongoose.Schema({
    channel: String, // Which channel
    coinAcc: {
        frequency: Number,// how often to update in MS
        amount: Number, //how many to add
        firstTimeBonus: Number, // how many do new users start out with?
    },
    coinsCommandFreq: Number, // How often to allow the !coins command to go through
    minbet: Number, // bets less than this will not be counted
    controllers: [String], // Other users allowed to issue chat commands. All lower case.
});
// create the model for channels and expose it to our app
module.exports = mongoose.model("Channel", channelSchema);