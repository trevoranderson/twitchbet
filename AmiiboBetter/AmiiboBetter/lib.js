var _ = require('lodash');
var getDistribution = module.exports.getDistribution = function getDistribution(arr) {
    var total = _.foldl(arr, function (acc, elem) {
        return acc + elem; z
    }, 0);
    var ret = [];
    _.each(arr, function (v) {
        ret.push(v / total);
    });
    return ret;
}
// Convert an array to an object
var arrToObj = module.exports.arrToObj = function arrToObj(arr, keyGen) {
    var ret = {};
    _.each(arr, function (e) { 
        ret[keyGen(e)] = e;
    });
    return ret;
}