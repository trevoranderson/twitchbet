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