var mongoose = require('mongoose');
var config = require('../config.js');
// define the schema for our user model
var userSchema = mongoose.Schema({
    nick: String,
    coins: Number,
});

// create the model for users and expose it to our app
module.exports = mongoose.model(config.channel.substring(1)+"User", userSchema);