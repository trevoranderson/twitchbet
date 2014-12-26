var irc = require("irc");
var _ = require('lodash');
var lib = require('./lib.js');
var colors = require('colors');
var config = require('./config.js');
var userDB = require('./models/userModel.js');
var chatDB = require('./models/chatModel.js');
var mongoose = require('mongoose');
mongoose.connect(config.dburl, function (err)
{ }); // connect to our database
var settings = {
    channels : config.channels,
    server : "irc.twitch.tv",
    port: 6667,
    secure: false,
    nick : config.account.nick,
    password : config.account.password,
}
var client = new irc.Client(settings.server, settings.nick, {
    channels: [settings.channels + " " + settings.password],
    debug: false,
    password: settings.password,
    username: settings.nick,
});
var AllChannels = _.map(config.channels, function (c) {
    return require('./controllers/channel.js')(c, client);
});
var Channels = lib.arrToObj(AllChannels, function (a) {
    return a.channel;
});
var fake = {
    say: function (chn, msg) {
        console.log(chn + " " + msg);
    },
};
// a wrapper for output.say so I can do additional things to it if I want to.
var output = {
    say: function (channel, msg) {
        client.say(channel, msg);
    }
}
client.addListener('error', function (message) {
    console.log('error: ', message);
});
var unconfirmedMods = {};
var confirmedMods = {};
var confirmedNonMods = {};
client.addListener("message", function (nick, channelname, message, opts, undf) {
    if (nick === "jtv") {
        if (message.indexOf("Invalid username:") === 0) {
            var name = message.split("Invalid username: ").pop();
            console.log(unconfirmedMods[name] + " is a mod");
            Channels[unconfirmedMods[name]].makeMod();
            delete unconfirmedMods[name];
        }
        else if (message.indexOf("You don't have permission to timeout people in this room.") === 0) {
            // JTV doesn't give any useful information
        }
        else {
            var cname = "#" + message.split(" ").pop();
            var randuser = Math.random().toString(36).slice(2);
            unconfirmedMods[randuser] = cname;
            output.say(cname, "/timeout " + randuser + " 1");
            setTimeout(function () {
                if (unconfirmedMods[randuser]) {
                    confirmedNonMods[unconfirmedMods[randuser]] = true;
                    console.log(unconfirmedMods[randuser] + " is NOT a mod");
                    delete unconfirmedMods[randuser];
                }
            }, 5000);
        }
        // JTV signals things like getting banned
        return;
    }
    if (config.controllers[nick] || channelname.substring(1) === nick || Channels[channelname].isController(nick)) {
        // The code under this will also run. Controllers are just priveliged, but can also bet and !coins
        // The broadcaster is assumed to be allowed to run any commands a controller can.
        parseControlMessage(channelname, message);
    }
    var command = _.map(message.trim().split(" "), function (token) { return token.trim(); });
    switch (command[0]) {
        case "!coins":
            if (command[1]) {
                Channels[channelname].getCoins(command[1], output.say);
            } 
            else {
                Channels[channelname].getCoins(nick, output.say);
            }
            break;
        case "!bet":
            if (command.length === 3) {
                Channels[channelname].makeBet(nick, command[2], command[1]);
            }
            else if (command.length === 2) { 
                // Check the bet of arg2
                Channels[channelname].checkBet(command[1].toLowerCase(), output.say);
            }
            else {
                // just !bet
                Channels[channelname].checkBet(nick, output.say);
            }
            break;
        case "!ticket":
            Channels[channelname].makeTicketBid(nick, command[1]);
            break;
        case "!bid":
            Channels[channelname].makeBid(nick, command[1], output.say);
            break;
        case "!commands":
            output.say(channelname, "Commands: !coins to check balance. !bet #amount #player to bet on a player (if gamble is open). !ticket to buy a raffle ticket (if raffle is open). !bid to bid on an auction (if one is open)");
            break;
        case "!help":
            if (!commands[1]) {
                output.say(channelname, "Help commands coming soon Kappa. Check out !commands for basic info.");
            }
            break;
    }
});
function parseControlMessage(channel, m) {
    var command = _.map(m.trim().split(" "), function (token) { return token.trim(); });
    switch (command[0]) {
        case "!gamble":
            switch (command[1]) {
                case "open":
                    names = command.slice(2);
                    Channels[channel].openBets(names, output.say);
                    break;
                case "close":
                    Channels[channel].closeBets(output.say);
                    break;
                case "winner":
                    Channels[channel].declareWinner(command[2], output.say);
                    break;
            }
            break;
        case "!raffle":
            switch (command[1]) {
                case "open":
                    Channels[channel].openRaffle(output.say);
                    break;
                case "close":
                    Channels[channel].closeRaffle(output.say);
                    break;
                case "pick":
                    var num = parseInt(command[2]);
                    if (num !== num) { break; }
                    var unique = (command[3] === "unique");
                    Channels[channel].chooseWinners(num, unique, output.say);
                    break;
            }
            break;
        case "!auction":
            switch (command[1]) {
                case "open":
                    Channels[channel].openAuction(output.say);
                    break;
                case "close":
                    Channels[channel].closeAuction(output.say);
                    break;
            }
            break;
        case "!top":
            Channels[channel].getTop(command[1], output.say);
            break;
    }
}