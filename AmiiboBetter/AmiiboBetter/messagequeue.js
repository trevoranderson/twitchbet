// timed function queue. Runs a maximum of 1 function per max frequency
module.exports = function (maxfreq) {
    var lastmessage = 0; // Timestamp of last message sent
    var queue = []; // Functions waiting to be run
    // Manages the queue if it has more than zero elements in it.
    // Checks are necessary since it calls itself until empty
    function Q_Manager() {
        if (queue.length && (new Date().getTime() - lastmessage) > maxfreq) {
            var fun = queue.shift();
            fun();
            lastmessage = new Date().getTime();
        }
        if (queue.length) { 
            setTimeout(Q_Manager, maxfreq);
        }
    }
    return {
        push: function (fun) {
            if ((new Date().getTime() - lastmessage) > maxfreq) {
                fun();
                lastmessage = new Date().getTime();
            }
            else {
                queue.push(fun);
                setTimeout(Q_Manager, (lastmessage + maxfreq) - new Date().getTime());
            }
        },
    };
}