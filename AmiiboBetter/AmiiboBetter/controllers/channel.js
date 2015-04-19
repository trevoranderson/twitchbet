// Controlls everything related to betting
var userDB = require('../models/userModel.js');
var chatDB = require('../models/chatModel.js');
var settingsDB = require('../models/channelSettingsModel.js');
var _ = require('lodash');
var lib = require("../lib.js");
var mqf = require("../messagequeue.js");
// send all output through here so it gets spaced out properly.
var mq = new mqf(1100);
var output = function output(sayer, channel, msg) {
    mq.push(function () {
        sayer(channel, msg);
    });
}
module.exports = function (channel, ircClient) {
    var config = {};
    settingsDB.findOne({ channel: channel }, function (e, r) {
        if (!r) {
            config = {
                channel: channel,
                coinAcc: {
                    frequency: 60000,// how often to update in MS
                    amount: 5, //how many to add
                    firstTimeBonus: 100, // how many do new users start out with?
                },
                coinsCommandFreq: 5000, // How often to allow the !coins command to go through
                minbet: 1,
                controllers: [],
            };
            var baby = new settingsDB(config);
            baby.save();
            AddCoins();
        }
        else {
            config = r;
            AddCoins();
        }
    });
    // Statuses go from distributed->open->closed
    // gamble state
    var maxBet = 0;
    var betStatus = "distributed";
    var bets = [0, 0, 0, 0, 0, 0, 0, 0]; // default is 8 teams
    var names = []; // follows bets;
    var namesToIndices = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 }; // For named arguments
    var betters = {}; // only let each person bet once. Maps nicks to .index, .amount
    // auction state
    var auctionStatus = "closed";
    var auctionLeader = {}; // .nick .amount
    // raffle state
    var raffleStatus = "closed";
    var rafflers = {}; // maps nicks to amount bid
    // State bundled with getCoins function so it doesn't spam the chat too often
    var currentUserCoins = {};
    var lastCoinsOutput = 0;
    
    function distributeWinnings(winner, sayer) {
        var betDist = lib.getDistribution(bets);
        var betDistStr = "Bets for:"
        names.forEach(function (v, i) {
            betDistStr += " " + v + " - (" + Math.floor(betDist[i] * 100) + "%);";
        });
        output(sayer, channel, betDistStr);
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
                userDB.findOne({ channel: channel, nick: k }, function (e, r) {
                    r.coins -= betters[k].amount;
                    r.save();
                    delete betters[k];
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
        if (!winnerTotals.length) {
            winStr += " No one!";
        } 
        else {
            _.each(winnerTotals, function (wt) {
                winStr += " " + wt.nick + " - " + wt.winnings + " (Bet " + wt.originalbet + ")";
                userDB.findOne({ channel: channel, nick: wt.nick }, function (e, r) {
                    if (e) { console.log(e); }
                    else {
                        r.coins += wt.winnings - wt.originalbet;
                        r.save();
                    }
                });
            });
        }
        output(sayer, channel, winStr);
    }
    // Every so often add coins to users or add them to the DB if they aren't there already
    function AddCoins() {
        if (ircClient && ircClient.chans && ircClient.chans[channel] && ircClient.chans[channel].users) {
            _.each(_.keys(ircClient.chans[channel].users), function (u) {
                userDB.findOne({ channel: channel, nick: u }, function (e, r) {
                    if (e) {
                        console.log(e);
                    }
                    else if (!r) {
                        var baby = new userDB({
                            channel: channel,
                            nick: u,
                            coins: config.coinAcc.amount + config.coinAcc.firstTimeBonus,
                        });
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
    }
    return {
        channel: channel,
        // Bet interface  closed->distributed->open
        openBets: function (nameArr, sayer) {
            if (betStatus !== "distributed") {
                return console.log("pay people before opening new window.");
            }
            betters = {};
            names = nameArr;
            bets = [];
            var namesStr = "";
            namesToIndices = {};
            names.forEach(function (v, i) {
                bets.push(0);
                namesStr += "(" + (i + 1) + ") " + v + " ";
                namesToIndices[v] = i;
            });
            betStatus = "open";
            output(sayer, channel, "Betting open for: " + namesStr + ((config.minbet !== 1)? (" (mininum bet: " + config.minbet + ")") : ("")));
            output(sayer, channel, "Bet by number (ex. !bet " + config.minbet + " 1) or by name (ex. !bet " + config.minbet + " " + nameArr[0] + ")");
        },
        closeBets: function (sayer) {
            if (betStatus !== "open") {
                return console.log("Gamble must be open before you can close");
            }
            betStatus = "closed";
            output(sayer, channel, "Bets locked in. No more bets can be made.");
        },
        declareWinner: function (winLabel, sayer) {
            if (betStatus !== "closed") {
                return console.log("close bet window before announcing winners");
            }
            betStatus = "distributed";
            var winner = parseInt(winLabel, 10) - 1;
            if (winner !== winner || winner < 0 || winner > bets.length) {
                // If using named argument, we are fine, but if its not an index and it isn't in the list, ignore the request
                if (namesToIndices[winLabel] === undefined) {
                    return;
                }
                else {
                    winner = namesToIndices[winLabel];
                }
            }
            var totalBet = _.foldl(bets, function (a, e) { return a + e; }, 0)
            output(sayer, channel, "A total of " + totalBet + " coins were bet.");
            if (totalBet) {
                distributeWinnings(winner, sayer); // Responsible for outputting bet distribution and winner's winnings as well as actually updating them
            }
        },
        makeBet: function makeBet(nick, onWhom, betamount) {
            if (betStatus !== "open") { return; } // Can't make a bet while the window is closed
            var betee = parseInt(onWhom, 10) - 1;
            if (betee !== betee || betee < 0 || betee > bets.length) {
                // If its not a number, or is out of bounds, attempt to cast it to a name and lookup its index
                if (namesToIndices[onWhom] === undefined) {
                    return;
                }
                else {
                    betee = namesToIndices[onWhom];
                }
            }
            // Next validate that the user has the coins they tried to bet
            var amt = parseInt(betamount, 10);
            if (amt !== amt || amt < config.minbet) { return; }//trolls may not bet an actual number
            userDB.findOne({ channel: channel, nick: nick }, function (e, r) {
                if (e) { console.log(e) }
                else if (!r) { }
                else {
                    var auctionCommitted = (auctionLeader.nick === nick) ? auctionLeader.amount : 0;
                    var raffleCommitted = (rafflers[nick]) ? rafflers[nick] : 0;
                    if (r.coins >= amt + auctionCommitted + raffleCommitted) {
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
        },
        checkBet: function (nick, sayer) {
            if (betStatus === "distributed") {
                return;
            }
            if (!(ircClient && ircClient.chans && ircClient.chans[channel] && ircClient.chans[channel].users && ircClient.chans[channel].users[nick] === "")) {
                return;
            }
            if (betters[nick]) {
                var betname = _.filter(_.keys(namesToIndices), function (n) {
                    return namesToIndices[n] === betters[nick].index;
                })[0];
                output(sayer, channel, nick + ": " + betters[nick].amount + " on " + (betters[nick].index + 1) + " (" + betname + ")");
            }
            else {
                output(sayer, channel, nick + ": no bets");
            }
        },
        // Auction Interface  closed->open
        openAuction: function (sayer) {
            if (auctionStatus !== "closed") {
                return console.log("bet window already open");
            }
            auctionStatus = "open";
            auctionLeader = {};
            output(sayer, channel, "Auction opened. Use !bid # to bid");
        },
        closeAuction: function (sayer) {
            if (auctionStatus !== "open") {
                return console.log("Gamble must be open");
            }
            auctionStatus = "closed"
            if (!auctionLeader.amount) {
                output(sayer, channel, "No auction winner. No bids made.");
            }
            output(sayer, channel, "Auction closed. Congrats to winner: " + auctionLeader.nick + " with bid: " + auctionLeader.amount);
            userDB.findOne({ channel: channel, nick: auctionLeader.nick }, function (e, r) {
                if (e) {
                    console.log(e);
                }
                else {
                    r.coins -= auctionLeader.amount;
                    r.save();
                    auctionLeader = {};
                }
            });
        },
        makeBid: function (nick, amount, sayer) {
            // Can't make a bet while the window is closed
            if (auctionStatus !== "open") { return; }
            var amt = parseInt(amount, 10);
            if (amt !== amt || amt <= auctionLeader.amount)
            { return; } //trolls may not bid an actual number
            userDB.findOne({ channel: channel, nick: nick }, function (e, r) {
                if (e) { console.log(e) }
                else if (!r) { }
                else {
                    var betCommitted = (betters[nick]) ? betters[nick].amount : 0;
                    var raffleCommitted = (rafflers[nick]) ? rafflers[nick] : 0;
                    if (r.coins >= amt + betCommitted + raffleCommitted) {
                        auctionLeader.nick = nick;
                        auctionLeader.amount = amt;
                        output(sayer, channel, nick + " in the lead with bid of " + amt);
                    }
                    else {
                        console.log(nick + "Tried to bid more than he had");
                    }
                }
            });
        },
        // raffle interface closed->open
        openRaffle: function (sayer) {
            if (raffleStatus !== "closed") {
                return console.log("bet window already open");
            }
            raffleStatus = "open";
            rafflers = {};
            output(sayer, channel, "Raffle opened. Use !ticket # to purchase tickets for a chance to win!");
        },
        makeTicketBid: function (nick, amount) {
            // Can't make a bet while the window is closed
            if (raffleStatus !== "open") { return; }
            var amt = parseInt(amount, 10);
            if (amt !== amt || amt <= 0) { return; } //trolls may not bid an actual number
            userDB.findOne({ channel: channel, nick: nick }, function (e, r) {
                if (e) { console.log(e) }
                else if (!r) { }
                else {
                    var betCommitted = (betters[nick]) ? betters[nick].amount : 0;
                    var auctionCommitted = (auctionLeader.nick === nick) ? auctionLeader.amount : 0;
                    if (r.coins >= amt + betCommitted + auctionCommitted) {
                        rafflers[nick] = amt;
                    }
                    else {
                        console.log(nick + "Tried to buy too many tickets");
                    }
                }
            });
        },
        chooseWinners: function chooseWinners(num, unique, sayer) {
            // Remove their coins
            if (raffleStatus !== "open") { return console.log("Open raffle before choosing winners"); }
            raffleStatus = "closed";
            var avoidRaceCondition = _.cloneDeep(rafflers);
            _.forOwn(rafflers, function (v, k) {
                userDB.findOne({ channel: channel, nick: k }, function (e, r) {
                    if (e) { console.log(e); }
                    else {
                        r.coins -= avoidRaceCondition[k];
                        r.save();
                    }
                });
            });
            var winners = [];
            for (var x = 0; x < num; x++) {
                var arr = [];
                var lh = 0;
                var total = 0;
                _.forOwn(rafflers, function (v, k) {
                    arr.push({ nick: k, left: lh, right: lh + v });
                    lh += v;
                    total += v;
                });
                var winInd = Math.floor(Math.random() * total);
                for (var i = 0; i < arr.length; i++) {
                    if (winInd < arr[i].right && winInd >= arr[i].left) {
                        winners.push({ nick: arr[i].nick, amount: rafflers[arr[i].nick] });
                        if (unique) {
                            delete rafflers[arr[i].nick];
                        }
                        break;
                    }
                }
            }
            rafflers = {};
            var winStr = "Raffle winners:";
            _.each(winners, function (w) {
                winStr += " " + w.nick + " (bid " + w.amount + ")";
            });
            output(sayer, channel, winStr);
        },
        getCoins: function getCoins(nick, sayer) {
            userDB.findOne({ channel: channel, nick: nick }, function (e, r) {
                if (!r || e) { return; }
                if (new Date().getTime() - lastCoinsOutput > config.coinsCommandFreq) {
                    currentUserCoins[nick] = (r) ? r.coins: 0;
                    var str = _.foldl(_.keys(currentUserCoins), function (acc, elem) {
                        var committedStr = "";
                        if (auctionLeader.nick === nick || rafflers[nick] || betters[nick]) {
                            committedStr = "(";
                            if (betters[nick]) {
                                committedStr += " bet: " + betters[nick].amount;
                            }
                            if (rafflers[nick]) {
                                committedStr += " tickets: " + rafflers[nick];
                            }
                            if (auctionLeader.nick === nick) {
                                committedStr += " bid: " + auctionLeader.amount;
                            }
                            committedStr += ")";
                        }
                        return (acc + elem + ": " + currentUserCoins[elem] + committedStr + "  ");
                    }, "");
                    lastCoinsOutput = new Date().getTime();
                    currentUserCoins = {};
                    output(sayer, channel, str);
                }
                else {
                    setTimeout(function () {
                        getCoins(nick, sayer);
                    }, lastCoinsOutput + config.coinsCommandFreq);
                }
            });
        },
        // Just unthrottles the messageQ
        makeMod: function () {
            mq = new mqf(1);
        },
        getTop: function (amount, sayer) {
            var amt = parseInt(amount, 10);
            if (amt !== amt || amt <= 0) { return; }
            userDB.find({ $query: { channel: channel }, $orderby: { coins : -1 } }).limit(amt).exec(function (e, r) {
                richStr = "Wealthiest users:";
                _.each(r, function (elem) {
                    richStr += " " + elem.nick + ": " + elem.coins;
                });
                output(sayer, channel, richStr);
            });
        },
        isController: function (nick) {
            if (config.controllers.indexOf(nick) !== -1) {
                return true;
            }
            else {
                return false;
            }
        }
    };
}