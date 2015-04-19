var _ = require('lodash');
var irc = require('irc');
var accounts = require("./accounts.js");
var colors = require('colors');
var channel = "#anhierawrs"; // the battlefield
console.log(("Kappa army population: " + accounts.slaves.length + " Kappas!").magenta);
var mqf = require("../messagequeue.js");
var REDSHELLCOST = 500;
var mq = new mqf(500);
var watchers = [];
_.each(accounts.slaves, function (a) {
    mq.push(function () {
        var settings = {
            channels : [channel],
            server : "irc.twitch.tv",
            port: 6667,
            secure: false,
            nick : a.nick,
            password : a.password,
        }
        var client = new irc.Client(settings.server, settings.nick, {
            channels: [settings.channels + " " + settings.password],
            debug: false,
            password: settings.password,
            username: settings.nick,
        });
        var spawnTime = new Date().getTime();
        var coins = 0;
        var checkedCoins = false;
        client.addListener("message", function (nick, channelname, message, opts, undf) {
            if (nick === "jtv") {
                if (message.indexOf("HISTORYEND ") === 0) {
                    console.log((settings.nick + " has joined the Kappa army").red);
                }
                else {
                    console.log(settings.nick + ": " + message);
                }
                return;
            }
            if (message.indexOf("coins: ") === 0) {
                // Only care about coins going to the maximizer
                if (message.indexOf(settings.nick + " - ") !== -1) {
                    // Update our coins
                    var s = message.split(settings.nick + " - ").pop().split(",")[0];
                    coins = parseInt(s, 10);
                    checkedCoins = true;
                    spawnTime = new Date().getTime();
                }
                return;
            }
        });
        watchers.push({
            client: client,
            nick: settings.nick,
            coins: function () { return coins + Math.floor((new Date().getTime() - spawnTime) / 12000); },
            subCoins : function (amt) { coins -= amt; },
            checkedCoins: function () { return checkedCoins; },
        });
    });
});
var settings = {
    channels : [channel, "#kappageneral"],
    server : "irc.twitch.tv",
    port: 6667,
    secure: false,
    nick : accounts.master.nick,
    password : accounts.master.password,
}
var client = new irc.Client(settings.server, settings.nick, {
    channels: [settings.channels + " " + settings.password],
    debug: false,
    password: settings.password,
    username: settings.nick,
});
client.addListener('error', function (message) {
    console.log('error: ', message);
});
var betters = {}; // hash names to last time bet
var kappasReady = false;
client.addListener("message", function (nick, channelname, message, opts, undf) {
    if (nick === "jtv") {
        console.log(channelname + message);
        return;
    }
    if (!kappasReady) {
        kappasReady = true;
        console.log("Kappas reporting for duty");
    }
    if (nick === "stockbets") {
    }
    if (message.indexOf("!bet") !== -1) {
        betters[nick] = new Date().getTime();
    }
    var commands = message.split(" ");
    if (nick === accounts.commander.nick.toLowerCase()) {
        if (commands.length === 1) {
            console.log("spam dis yo: " + message);
            _.each(watchers, function (w) {
                setTimeout(function () { w.client.say(channel, message); }, Math.random() * 30000);
            });
            return;
        }
        // Show of force. All Kappas, report for duty
        if (message === "Kappa") {
            _.each(watchers, function (w) {
                setTimeout(function () { w.client.say(channel, "Kappa"); }, Math.random() * 30000);
            });
        }
        // Figure out how much ammunition you have
        else if (message === "Kappa s load your Kappa cannons") {
            _.each(watchers, function (w) {
                setTimeout(function () {
                    w.client.say(channel, "!coins");
                }, Math.random() * 60000);
            });
        }
        // Hit someone doing damage of command[2]: Kappa shell [name] [amount]
        else if (commands[0] === "Kappa" && commands[1] === "shell") {
            console.log("Kappa shell storm commenced".red);
            _.each(watchers, function (w) {
                setTimeout(function () {
                    sheller(w);
                }, Math.random() * (600000 * (watchers.length / 10))); // spread out requests over 10 minutes
            });
        }
    }
});
//function sheller(account) {
//    var coins = account.coins();
//    if (! account.checkedCoins()) {
//        console.log((account.nick + " is looking up their coins.").bgGreen);
//        account.client.say(channel, "!coins");
//        setTimeout(function ()
//        { sheller(account); }, Math.random() * 300000 + 300000); // wait a while before response
//    }
//    else if (coins > 500) {
//        //schedule a shell and wait for a long time
//        // Choose a target
//        var targets = _.filter(_.shuffle(_.keys(betters)), function (k) {
//            if (!betters[k] || (new Date().getTime() - betters[k]) > 1200000 || betters[k.toLowerCase()] === "stockbets" || betters[k.toLowerCase()] === "amiibofighter") {
//                delete betters[k];
//                return false;
//            }
//            return true;
//        });
//        if (targets.length === 0) { 
//        }
//        else {
//            account.client.say(channel, "!shell red " + targets[0]);
//            console.log((account.nick + " shells " + targets[0]).bgBlue);
//            delete betters[targets[0]];
//        }
//        setTimeout(function () {
//            account.subCoins(500);
//            sheller(account);
//        }, Math.random() * 1800000 + 400000);// 15 minute average, but between 5 and 25 minute wait
//    }
//    else {
//        // calculate the time to get enough coins
//        var timeRemaining = (500 - coins) * 12000;
//        console.log((account.nick + " doesn't have enough $$").bgMagenta);
//        setTimeout(function () {
//            var targets = _.filter(_.shuffle(_.keys(betters)), function (k) {
//                if (!betters[k] || (new Date().getTime() - betters[k]) > 1200000 || betters[k.toLowerCase()] === "stockbets" || betters[k.toLowerCase()] === "amiibofighter") {
//                    delete betters[k];
//                    return false;
//                }
//                return true;
//            });
//            if (targets.length === 0) {
//            }
//            else {
//                console.log((account.nick + " shells " + targets[0]).bgBlue);
//                account.client.say(channel, "!shell red " + targets[0]);
//                delete betters[targets[0]];
//            }
//            setTimeout(function () {
//                account.subCoins(500);
//                sheller(account);
//            }, Math.random() * 1800000 + 400000);// 15 minute average, but between 5 and 25 minute wait
//        }, timeRemaining + 181000);// add 3 minutes to be safe
//    }
//}