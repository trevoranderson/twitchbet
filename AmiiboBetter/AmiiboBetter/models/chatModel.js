var mongoose = require('mongoose');
var config = require('../config.js');
// define the schema for our user model
var chatSchema = mongoose.Schema({
    history: [{ time: Number, msg: String, nick: String }],
});

// create the model for chats and expose it to our app
module.exports = mongoose.model(config.channel.substring(1) + "Chat", chatSchema);