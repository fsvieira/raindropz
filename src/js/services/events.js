
var events = {};

function on (name, fn) {
    var e;
    events[name] = e = events[name] || [];

    if (e.indexOf(fn) === -1) {
        e.push(fn);
    }
}

function off (name, fn) {
    if (fn && events[name]) {
        var index = events[name].indexOf(fn);
        if (index !== -1) {
            events[name].splice(index, 1);            
        }
    }
    else {
        delete events[name];
    }
}

function trigger (name, data) {
    var listenners = events[name];
    
    if (listenners) {
        for (var i=0; i<listenners.length; i++) {
            listenners[i](data);
        }
    }
}

module.exports = {
    on: on,
    off: off,
    trigger: trigger
};
