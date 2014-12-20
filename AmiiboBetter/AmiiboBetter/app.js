var irc = require("irc");
var _ = require('lodash');
var lib = require('./lib.js');
var colors = require('colors');
var config = require('./config.js');
var userDB = require('./models/userModel.js');
var chatDB = require('./models/chatModel.js');
var mongoose = require('mongoose');
mongoose.connect(config.dburl, function (err) {
    chatDB.find().exec(function (e, r) {
        if (!r.length) {
            var h = new chatDB();
            h.save();
        }
    });
}); // connect to our database


var settings = {
    channels : [config.channel],
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
var fake = {
    say: function (a, b) {
        console.log(a + " " + b);
    },
};

client.addListener('error', function (message) {
    console.log('error: ', message);
});
client.addListener("message", function (nick, channelname, message, opts) {
    if (nick === "jtv") {
        // JTV signals things like getting banned
        return;
    }
    chatDB.findOne(function (e, r) {
        r.history.push({ time: new Date().getTime(), msg: message, nick: nick });
        r.markModified('history');
        r.save();
    });
    if (config.controllers[nick]) {
        // The code under this will also run. Controllers are just priveliged, but can also bet and !coins
        parseControlMessage(message);
    }
    var command = _.map(message.trim().split(" "), function (token) { return token.trim(); });
    switch (command[0]) {
        case "!coins":
            getCoins(nick);
            break;
        case "!bet":
            makeBet(nick, command.slice(1));
            break;
    }
});
//client.addListener("join", function (channel, nick, rawr) {
//    client.say("rawr");
//    console.log("That happened");
//});
//client.addListener("part", function (channel, nick) {
//    console.log("That happened");
//});

var maxBet = 0;
var betWindowOpen = false;
var bets = [0, 0, 0, 0, 0, 0, 0, 0]; // default is 8 teams
var names = []; // follows bets;
var namesToIndices = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 }; // For named arguments
var betters = {}; // only let each person bet once


function parseControlMessage(m) {
    var command = _.map(m.trim().split(" "), function (token) { return token.trim(); });
    switch (command[0]) {
        case "!gamble":
            switch (command[1]) {
                case "open":
                    betters = {};
                    names = [];
                    var betMax = parseInt(command[2], 10);
                    maxBet = (betMax === betMax)? betMax: 0;
                    client.say(config.channel, "New Betting Pool opened! Max bet = " + maxBet + " coins");
                    names = command.slice(3);
                    var namesStr = "";
                    bets = [];
                    namesToIndices = {};
                    names.forEach(function (v, i) {
                        bets.push(0);
                        namesStr += "(" + (i + 1) + ") " + v + " ";
                        namesToIndices[v] = i;
                    });
                    betWindowOpen = true;
                    client.say(config.channel, "Betting open for: " + namesStr);
                    client.say(config.channel, "Bet by typing \"!bet 50 1\" to bet 50 coins on option 1, \"!bet 25 2\" to bet 25 on option 2, etc");
                    break;
                case "close":
                    betWindowOpen = false;
                    client.say(config.channel, "Bets locked in. Good luck everyone!");
                    break;
                case "winner":
                    var winner = parseInt(command[2], 10) - 1;
                    if (winner !== winner || winner < 0 || winner > bets.length) {
                        // If using named argument, we are fine, but if its not an index and it isn't in the list, ignore the request
                        if (namesToIndices[command[2]] === undefined) {
                            return;
                        }
                        else {
                            winner = namesToIndices[command[2]];
                        }
                    }
                    client.say(config.channel, "Betting Pool closed! A total of " + _.foldl(bets, function (a, e) { return a + e; }, 0) + " coins were bet.");
                    distributeWinnings(winner); // Responsible for outputting bet distribution and winner's winnings as well as actually updating them
                    break;
            }
            break;
    }
}
// Attempts to make a bet on behalf of nick. Bet arr should be [amount,index/name]
function makeBet(nick, betArr) {
    if (!betWindowOpen) { return; } // Can't make a bet while the window is closed
    var betee = parseInt(betArr[1], 10) - 1;
    if (betee !== betee || betee < 0 || betee > bets.length) {
        // If its not a number, or is out of bounds, attempt to cast it to a name and lookup its index
        if (namesToIndices[betArr[1]] === undefined) {
            return;
        }
        else {
            betee = namesToIndices[betArr[1]];
        }
    }
    // Next validate that the user has the coins they tried to bet
    var amt = parseInt(betArr[0], 10);
    if (amt !== amt || amt < config.minbet || amt > maxBet) { return; }//trolls may not bet an actual number
    userDB.findOne({ nick: nick }, function (e, r) {
        if (e) { console.log(e) }
        else if (!r) { }
        else {
            if (r.coins >= amt) {
                if (betters[nick]) {
                    bets[betters[nick].index] -= betters[nick].amount;
                }
                betters[nick] = {
                    index: betee,
                    amount: amt,
                };
                bets[betee] += amt;
            }
            else {
                console.log(nick + "Tried to bet more than he had");
            }
        }
    });
}
// Responsible for saying bet distribution (with names and index) and the distribution of the winnings
// as well as adjusting the winner's coin totals in the database
function distributeWinnings(winner) {
    var betDist = lib.getDistribution(bets);
    var betDistStr = "Bets for:"
    names.forEach(function (v, i) {
        betDistStr += " " + v + " - (" + Math.floor(betDist[i] * 100) + "%);";
    });
    client.say(config.channel, betDistStr);
    // Now need to calculate winnings
    var pool = _.foldl(bets, function (a, e) { return a + e; }, 0);
    var winTotal = 0; // How many coins were bet on the winner
    var winners = [];
    _.forOwn(betters, function (v, k) {
        if (betters[k].index === winner) {
            winTotal += betters[k].amount;
            winners.push({ nick: k, amount: betters[k].amount });
        }
        else {
            // Each better loses the amount they bet. (winners gain it back later)
            userDB.findOne({ nick: k }, function (e, r) {
                r.coins -= betters[k].amount;
                r.save();
            });
        }
    });
    var winnerTotals = _.map(winners, function (w) {
        return {
            nick: w.nick,
            winnings: Math.floor((w.amount / winTotal) * pool),
            originalbet: w.amount,
        };
    });
    var winStr = "Winners:";
    _.each(winnerTotals, function (wt) {
        winStr += " " + wt.nick + " - " + wt.winnings + " (Bet " + wt.originalbet + ")";
        userDB.findOne({ nick: wt.nick }, function (e, r) {
            if (e) { console.log(e); }
            else {
                r.coins += wt.winnings - wt.originalbet;
                r.save();
            }
        });
    });
    client.say(config.channel, winStr);
}
// State bundled with function so it doesn't spam the chat too often
var currentUserCoins = {};
var lastCoinsOutput = 0
function getCoins(nick) {
    return userDB.findOne({ nick: nick }, function (e, r) {
        if (!r) {
            currentUserCoins[nick] = 0;
            return;
        }
        currentUserCoins[nick] = r.coins;
        if (new Date().getTime() - lastCoinsOutput > config.coinsCommandFreq) {
            var str = _.foldl(_.keys(currentUserCoins), function (acc, elem) {
                return (acc + elem + ": " + currentUserCoins[elem] + "  ");
            }, "");
            lastCoinsOutput = new Date().getTime();
            currentUserCoins = {};
            client.say(config.channel, nick + ": " + r.coins);
        }
        else {
            setTimeout(function () {
                getCoins(nick);
            }, lastCoinsOutput + config.coinsCommandFreq);
        }
    });
}
// Every so often add coins to users or add them to the DB if they aren't there already
(function AddCoins() {
    if (client && client.chans && client.chans[config.channel] && client.chans[config.channel].users) {
        _.each(_.keys(client.chans[config.channel].users), function (u) {
            userDB.findOne({ nick: u }, function (e, r) {
                if (e) {
                    console.log(e);
                }
                else if (!r) {
                    var baby = new userDB();
                    baby.nick = u;
                    baby.coins = config.coinAcc.amount + config.coinAcc.firstTimeBonus;
                    baby.save();
                }
                else {
                    r.coins += config.coinAcc.amount;
                    r.save();
                }
            });
        });
    }
    setTimeout(AddCoins, config.coinAcc.frequency);
})();