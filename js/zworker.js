(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
class Events {
    constructor() {
        this.listenners = {};
        
        // debug,
        this.dupsCounter = 0;
        this.dups = {};
    }
    
    on (event, fn) {
        const listenners = this.listenners[event] = this.listenners[event] || [];
        if (this.listenners[event].indexOf(fn) === -1) {
            listenners.push(fn);
        }
    }
    
    off (event, fn) {
        const listenners = this.listenners[event];
        if (listenners) {
            if (fn) {
                const index = listenners.indexOf(fn);
                if (index !== -1) {   
                    listenners.splice(index, 1);
                }
            }
            
            if (!fn || !listenners || !listenners.length) {
                delete this.listenners[event];
            }
        }
    }
    
    trigger (event, value) {
        // don't check track events for now.
        // DEBUG:
/*
        if (event !== 'track') {
            this.dups[event] = this.dups[event] || {};
            const v = JSON.stringify(value);
            if (this.dups[v]) {
                this.dupsCounter++;
                console.log("Duplicates : ["+event+"] " + this.dupsCounter + " v=> " + v);
            }
            else {
                this.dups[v] = true;
            }
        }*/
        
        const listenners = this.listenners[event];
        if (listenners) {
            for (var i=0; i<listenners.length; i++) {
                listenners[i](value);
            }
        }
        
    }
}


module.exports = Events;




},{}],2:[function(require,module,exports){
const Events = require("../events");

function getStates(transitions) {
    var states = [];

    for (var from in transitions) {
        if (states.indexOf(from) === -1) {
            states.push(from);
        }

        if (transitions[from].to) {
            for (var j=0; j<transitions[from].to.length; j++) {
                const to = transitions[from].to[j];
                if (states.indexOf(to) === -1) {
                    states.push(to);
                }
            }
        }
    }

    return states;
}


function getPaths(states, state) {
    const visited = [];
    var go = states[state].tos.slice(0);

    while (go.length) {
        const s = go.pop();
        if (visited.indexOf(s) === -1) {
            visited.push(s);
            go = go.concat(states[s].tos);
        }
    }

    return visited;
}

function getOrderedPaths(transitions, ordered) {
    const states = {};

    getStates(transitions).forEach(function(state) {
        var tos;
        if (transitions[state]) {
            tos = transitions[state].to;
        }

        states[state] = {
            ordered: ordered.indexOf(state) !== -1,
            tos: tos || []
        };
    });

    for (var state in states) {
        states[state].paths = getPaths(states, state).filter(function(s) {
            return s !== state && ordered.indexOf(s) !== -1;
        });

        states[state].keepOrder = states[state].paths.length > 0;

    }

    return states;
}

function processResponse(self, o, states, getState, state) {
    return function({
        value,
        values,
        trackId
    }) {
        if (trackId !== undefined) {
            o.trackIds = o.trackIds || [];
            if (o.trackIds.indexOf(trackId) === -1) {
                o.trackIds.push(trackId);
                // registers id,
                self.track([trackId], 1);
            }
        }

        if (values) {
            o.value = values.map(function(v) {
                return {
                    state: getState(v),
                    trackIds: o.trackIds,
                    value: v
                };
            });

            o.state = '_expand';

            o.value.forEach(function (v) {
                if (!self.stateAttributes[v.state].ordered) {
                    states[v.state].push(v);
                }
            });

            self.track(o.trackIds, values.length);
        }
        else if (value) {
            const state = getState(value);
            o.value = value;
            o.state = state;

            if (!self.stateAttributes[state].ordered) {
                states[state].push(o);
            }

            self.track(o.trackIds, 1);
        }
        else {
            o.state = '_delete';
        }

        self.track(o.trackIds, -1);

        o.wait = false;

        self.cycle();

        self.halt(-1, state);
    };
}

class Kanban {

    constructor({
        transitions,
        ordered,
        start,
        context,
        store
    }, events) {
        this.start = start;
        this.states = {};
        this.stateAttributes = getOrderedPaths(transitions, ordered);
        this.context = context;
        this.store = store;
        
        const states = getStates(transitions);

        this.transitions = transitions;
        this.running = false;

        this.ordered = ordered;
        this.order = [];

        this.actives = 0;

        this.events = events || new Events();
        this.tracking = {};
        
        this.activeStates = {};
        
        const self = this;
        
        for (var i = 0; i < states.length; i++) {
            const state = states[i];
            const attr = this.stateAttributes[state];
            this.states[states[i]] = [];
            
            if (!attr.keepOrder && !attr.ordered) {
                this.events.on("add-" + state, function (value) {
                    self.halt(1, state);
                    processResponse(self, {}, self.states, function () {
                        return state;
                    }, state)(value);
                });
            }
        }
    }

    halt (v, state) {
        this.activeStates[state] = this.activeStates[state] || 0;
        this.activeStates[state] += v || 0;
        
        this.actives += v || 0;

        // console.log("Actives: " + JSON.stringify(this.activeStates));

        if (this.activeStates[state] < 0) {
            throw new Error("Actives States (" + state + ") can't be less then 0.");
        }

        const noWork = !this.hasWork();
        
        // console.log("No Work: " + (noWork?"yes":"no"));
        
        if (noWork && this.actives === 0) {
            this.events.trigger('halt');
            return true;
        }

        return false;
    }

    track (ids, active) {
        if (ids !== undefined) {
            for (var i = 0; i < ids.length; i++) {
                const id = ids[i];

                const actives = this.tracking[id] = (this.tracking[id] || 0) + active;

                this.events.trigger('track', {
                    id,
                    actives
                });

                if (this.tracking[id] === 0) {
                    delete this.tracking[id];
                }
            }
        }
    }

    add (value) {
        const start = this.start;
        const o = {
            state: start,
            value
        };

        if (this.stateAttributes[this.start].keepOrder) {
            this.order.push(o);
        }
        
        this.halt(1, start);
        processResponse(this, o, this.states, () => {
            return start;
        }, start)(value);
    }

    hasWork () {
        for (var state in this.states) {
            if (this.transitions[state] && this.states[state].length > 0) {
                return true;
            }
        }

        if (this.order.length) {
            const first = this.order[0];

            return !first.wait && (first.state === '_expand' || first.state === '_delete' || this.stateAttributes[first.state].ordered);
        }

        return false;
    }

    cycle () {
        if (!this.running) {
            this.running = true;
            const states = this.states;

            while (this.hasWork()) {
                for (var s in states) {
                    if (states[s].length === 0) {
                        continue;
                    }

                    const transition = this.transitions[s];
                    if (transition) {
                        const o = states[s].shift();
                        // const state = transition.next(o.value);
                        const req = {
                            args: o.value,
                            context: this.context,
                            store: this.store
                        };
                        
                        const res = {
                            send: processResponse(
                                this,
                                o,
                                states,
                                transition.dispatch || function () {
                                    return transition.to[0];
                                },
                                s
                            )
                        };

                        this.halt(1, s);
                        transition.process(req, res);
                    }
                }

                // check ordered states,
                for (; this.order.length;) {
                    const first = this.order[0];
                    const attr = this.stateAttributes[first.state];

                    if (!first.wait && attr && attr.ordered) {
                        if (attr.keepOrder) {
                            first.wait = true;
                            states[first.state].push(first);
                            break;
                        }
                        else {
                            this.order.shift();
                            states[first.state].push(first);
                        }
                    }
                    else if (first.state === '_expand') {
                        this.order.splice(0, 1, ...first.value);
                    }
                    else if (first.state === '_delete') {
                        this.order.shift();
                    }
                    else {
                        break;
                    }
                }
            }

            this.running = false;
        }
    }
}

module.exports = Kanban;

},{"../events":1}],3:[function(require,module,exports){
const Kanban = require("./kanban");
const ZVS = require("../zvs/zvs");
const Events = require("../events");
const prepare = require("./transitions/definitions/prepare");

const {
    include,
    parse,
    check,
    merge,
    negations,

    // definitions    
    prepareDefinitions,
    checkDefinitions,
    multiplyDefinitions,

    // query
    prepareQuery,
    checkDepth,
    updateQuery,
    filterUncheckedTuples,

    // Unify
    matchTuples,
    copyDefinitions,
    
    // negations,
    filterUncheckedNegations
} = require("./transitions/index");



function exists (zvs, events) {

    const queries = {};

    function track ({
        id,
        actives
    }) {

        if (actives === 0) {
            const query = queries[id];
            
            if (query !== undefined) {
                delete queries[id];
                
                query.forEach(({branchId, tupleId, resolve}) => {
                    zvs.update(branchId, tupleId, {exists: false});
                    resolve(tupleId);
                });
            }
        }
    }

    function success (successBranchId) {
        const id = zvs.getObject(successBranchId, zvs.data.global("queryBranchId")).data;
        const query = queries[id];
            
        if (query !== undefined) {
            delete queries[id];

            query.forEach(({branchId, tupleId, reject}) => {
                zvs.update(branchId, tupleId, {exists: true});
                reject();
            });
        }
    }
    
    events.on("track", track);
    events.on("success", success);
    
    return (branchId, tupleId) => {
        return new Promise((resolve, reject) => {
            const neg = zvs.getObject(branchId, tupleId);
    
            const nQueryId = zvs.data.add(
                prepare.query(neg)
            );
            
            const definitionsBranchId = zvs.getData(branchId, zvs.getData(branchId, zvs.getData(branchId, zvs.data.global("definitions")).data).branchId);
            const {branchId: queryBranchId, exists} = zvs.branches.getId({
                parent: definitionsBranchId,
                args: [nQueryId],
                action: 'query'
            });
            
            const query = queries[queryBranchId] = queries[queryBranchId] || [];
            
            query.push({
                resolve,
                reject,
                branchId,
                tupleId
            });
            
            if (!exists) {
        
                zvs.branches.transform(
                    queryBranchId,
                    zvs.data.global("queryBranchId"),
                    zvs.data.add({
                        type: 'query',
                        data: queryBranchId
                    })
                );
                
                zvs.branches.transform(queryBranchId, zvs.data.global("query"), nQueryId);
            }
            /*
                TODO:
                    - if query exists then:
                        * its running and no need for new query or ...
                        * it has a result and so we can solve it without running query.
            */

            /*
                TODO:
                    - use prepare query phase insted ??
            */
            events.trigger('add-checkDepth', {value: queryBranchId, trackId: queryBranchId});
        });
    };
}

class Session {

    constructor ({events = new Events(), readFile, settings}) {

        this.events = events;
        this.zvs = new ZVS(this.events);

        this.zvs.update(
            this.zvs.branches.root, 
            this.zvs.data.global("settings"), 
            {
                data: settings
            }
        );

        const pipeline = {
            transitions: {
                files: {
                    process: include,
                    to: ['texts']
                },
                texts: {
                    process: parse,
                    to: ['files', 'prepareDefinitions'],
                    dispatch: function (value) {
                        if (value.type === 'include') {
                            return 'files';
                        }

                        return 'prepareDefinitions';
                    }
                },
                prepareDefinitions: {
                    process: prepareDefinitions,
                    to: ['checkDefinitions']
                },
                checkDefinitions: {
                    process: checkDefinitions(false),
                    to: ['multiplyDefinitions']
                },
                multiplyDefinitions: {
                    process: multiplyDefinitions,
                    to: ['checkMultiplyDefinitions']
                },
                checkMultiplyDefinitions: {
                    process: checkDefinitions(true),
                    to: ['prepareQuery']
                },
                prepareQuery: {
                    process: prepareQuery,
                    to: ['checkDepth']
                },
                checkDepth: {
                    process: checkDepth,
                    to: ['updateQuery']
                },
                updateQuery: {
                    process: updateQuery,
                    to: ['filterUncheckedTuples']
                },
                filterUncheckedTuples: {
                    process: filterUncheckedTuples,
                    to: ['filterUncheckedNegations', 'matchTuples'],
                    dispatch: function (value) {
                        if (value.tuples.length === 0) {
                            return 'filterUncheckedNegations';
                        }
                        
                        return 'matchTuples';
                    }
                },
                matchTuples: {
                    process: matchTuples,
                    to: ['copyDefinitions']
                },
                copyDefinitions: {
                    process: copyDefinitions,
                    to: ['check']
                },
                check: {
                    process: check,
                    to: ['filterUncheckedNegations']
                },
                filterUncheckedNegations: {
                    process: filterUncheckedNegations,
                    to: ['negations']
                },
                negations: {
                    process: negations,
                    to: ['merge', 'success', 'checkDepth'],
                    dispatch: function (value) {
                        if (value.branchId !== undefined) {
                            return 'success';
                        }
                            
                        if (value.branches && value.branches.length > 1) {
                            return 'merge';
                        }

                        return 'checkDepth';
                    }
                },
                merge: {
                    process: merge,
                    to: ['filterUncheckedNegations']
                },
                success: {
                    process: (req, res) => {
                        const {branchId} = req.args;
                        const {zvs, events} = req.context;
                        const queryBranchId = zvs.getObject(branchId, this.zvs.data.global("queryBranchId")).data;

                        zvs.branches.end({
                            rootBranchId: queryBranchId,
                            branchId, 
                            success: true
                        });

                        events.trigger("success", branchId);
                        res.send({});
                    }
                }
            },
            ordered: ['files', 'prepareDefinitions', 'checkDefinitions'],
            start: 'texts',
            context: {
                zvs: this.zvs,
                events,
                readFile,
                exists: exists(this.zvs, events)
            },
            store: {
                files: [],
                definitions: [],
                id: 0
            }
        };

        this.kanban = new Kanban(pipeline, this.events);
    }
    
    add (value) {
        this.kanban.add(value);
    }
}

module.exports = Session;


},{"../events":1,"../zvs/zvs":30,"./kanban":2,"./transitions/definitions/prepare":8,"./transitions/index":10}],4:[function(require,module,exports){
const actionUnify = require("./unify");

function check (req, res) {
    const {zvs} = req.context;
    const {branchId, tuples: mergeTuples} = req.args;
    
    const queryId = zvs.data.global("query");
    const merge = [];

    for (var i=0; i<mergeTuples.length; i++) {
        const {tuple, definitions} = mergeTuples[i];
        const r = [];
                
        for (var j=0; j<definitions.length; j++) {
            const {negation, definition} = definitions[j];
            const unifyBranchId = actionUnify(zvs, {branchId, args: [tuple, definition]});
                    
            if (unifyBranchId) {
                if (negation && negation.length > 0) {
                    const query = Object.assign({}, zvs.getData(unifyBranchId, queryId)); 
                    const qnegation = zvs.getData(unifyBranchId, query.negation).slice(0);
                            
                    for (var n=0; n<negation.length; n++) {
                        const nId = zvs.data.add(negation[n]);
                                
                        if (qnegation.indexOf(nId) === -1) {
                            qnegation.push(nId);
                        }
                    }

                    query.negation = zvs.data.getId(qnegation.sort());
                    zvs.branches.transform(unifyBranchId, queryId, zvs.data.getId(query));
                }
                        
                // events.trigger('branch', {branchId: unifyBranchId});
                r.push(unifyBranchId);
                /*r.push({
                    branchId: unifyBranchId,
                    tuple,
                    definition
                });*/
            }
        }
                
        if (r.length > 0) {
            merge.push(r);
        }
        else {
            // branch fails, 
            // TODO: we need to mark branch as fail.
            res.send({});
            return;
        }
    }
    
    res.send({value: {branches: merge}});
}


module.exports = {check};
},{"./unify":19}],5:[function(require,module,exports){
const Match = require("../../../match/match");
const ZVS = require("../../../zvs/zvs");
const utils = require("../../../utils");

function checkDefinition (zvs, branchId, tupleId, match) {
    const tuples = [tupleId];
    const done = [tupleId];
    
    while (tuples.length) {
        const tupleId = tuples.pop();
        
        const m = match.match(branchId, tupleId);
        
        if (!m|| m.length === 0) {
            return false;
        }
        
        const data = zvs.getData(branchId, zvs.getData(branchId, tupleId).data);
        
        for (let i=0; i<data.length; i++) {
            const id = data[i];
            const v = zvs.getData(branchId, id);
            const type = zvs.getData(branchId, v.type);
            
            if (type === 'tuple') {
                if (done.indexOf(id) === -1) {
                    done.push(id);
                    tuples.push(id);
                }
            }
        }
    }
    
    return true;
}

function checkDefinitions (failRecover) {
    return function (req, res) {
        const {events} = req.context;
        const {query, definitions} = req.args;
        
        const tmpZVS = new ZVS();
        const definitionsIds = definitions.map(d => tmpZVS.data.add(d));
    
        const match = new Match(tmpZVS);
        
        match.addTuples(definitionsIds);
    
        for (let i=definitionsIds.length-1; i>=0; i--) {
            if (!checkDefinition(tmpZVS, tmpZVS.branches.root, definitionsIds[i], match)) {

                if (failRecover) {
                    console.log("Recover: Invalid definition: " + utils.toString(definitions[i]));
                    definitions.splice(i, 1);
                }
                else {
                    console.log("Error: Invalid definition: " + utils.toString(definitions[i]));

                    /*
                        TODO:
                            - Need to decide how to handle errors, we should abort everything?
                            - Running executions are still valid ...
                            - All future executions are invalid.
                        
                        TODO:
                            - give more information about definition in fault, like what subtuple,
                            if possible what line and what column.
                    */
                    events.trigger("error", "Invalid definition: " + utils.toString(definitions[i]) + ", before query: " + utils.toString(query.data));
                    res.send({});
                    return;
                }
            }
        }
    
        res.send({value: {query, definitions}});
    };
}

module.exports = checkDefinitions;

},{"../../../match/match":22,"../../../utils":24,"../../../zvs/zvs":30}],6:[function(require,module,exports){
const ZVS = require("../../../zvs/zvs");
const prepare = require("./prepare");
const actionUnify = require("../unify");

function _multiply (zvs, definitions) {
    if (definitions.length > 1) {
        const results = [definitions.shift()];

        for (var i=0; i<definitions.length; i++) {
            // d * r
            const d = definitions[i];
            
            for (var j=0; j<results.length; j++) {
                const r = results[j];
                const result = actionUnify(zvs, {branchId: zvs.branches.root, args: [d, r]});
                
                if (result !== undefined) {
                    const id = zvs.getUpdatedId(result, d);

                    if (id !== undefined && results.indexOf(id) === -1) {
                        results.push(id);
                    }
                }
            }
        }
        
        const r = _multiply(zvs, definitions);
        
        r.forEach(d => {
            if (results.indexOf(d) === -1) {
                results.push(d);
            }
        });
        
        return results;
    }

    return definitions; 
}

function multiply(definitions) {
    const zvs = new ZVS();
    
    definitions = prepare.definitions(definitions);
    
    const r = _multiply(zvs, definitions.map(d => zvs.data.add(d)));
    const results = r.map(d => zvs.getObject(zvs.branches.root, d));

    return prepare.definitions(results);
}

function multiplyDefinitions (req, res) {
    const {query, definitions} = req.args;
    
    // TODO: make sure that definitions don't change, and copy is made.
    res.send({value: {query, definitions: multiply(definitions)}});
}

module.exports = multiplyDefinitions;


},{"../../../zvs/zvs":30,"../unify":19,"./prepare":8}],7:[function(require,module,exports){
const prepare = require("./prepare");

function prepareDefinitions (req, res) {
    
    function genId () {
        return "id$" + req.store.id++;
    }
        
    const definitions = req.store.definitions;
    const tuple = req.args;
    
    if (tuple.type === 'query') {
        res.send({
            value: {
                definitions,
                query: tuple
            }
        });
    }
    else {
        const def = prepare.copyWithVars(tuple, genId);
        def.check = true;
                
        definitions.push(def);
        req.store.definitionsBranchId = undefined;
        res.send({});
    }
}

module.exports = prepareDefinitions;
},{"./prepare":8}],8:[function(require,module,exports){
function clone (obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
        return obj;
    }
 
    var temp = obj.constructor(); // give temp the original obj's constructor
    for (var key in obj) {
        temp[key] = clone(obj[key]);
    }
 
    return temp;
}

function copyWithVars (p, genId) {
    p = clone(p);
    var q = [p];
    var vars = {};
    var nots = [];

    while (q.length > 0) {
        var v = q.pop();
        
        if (v.type === 'variable') {
            if(v.data && v.data.trim().length > 0) {
                v.id = vars[v.data] || genId();
                vars[v.data] = v.id;
            }
            else {
                v.id = genId();
            }
        }
        else if (v.type === 'tuple') {
            q = q.concat(v.data);
            if (v.negation) {
                nots = nots.concat(v.negation);
                q = q.concat(v.negation);
                delete v.negation;
            }
        }
    }

    p.negation = nots;
    
    return p;
}

function query (query) {
    return prepare([query], "query$", false)[0];
}

function definitions (defs) {
    return prepare(defs, "definition$", true);
}

function prepare (tuples, prefix, check) {
    var defs = [];
    var counter = 0;
    var genId = function () {
        return prefix + counter++;
    };

    for (var i=0; i<tuples.length; i++) {
        var tuple = tuples[i];
        defs.push(copyWithVars(tuple, genId));
    }

    return defs.map(function (def) {
        def.check = check;
        return def;
    });
}

function uniq_fast(a) {
    var seen = {};
    var out = [];
    var len = a.length;
    var j = 0;
    for(var i = 0; i < len; i++) {
        var item = a[i];
        if(seen[item] !== 1) {
            seen[item] = 1;
            out[j++] = item;
        }
    }
    
    return out.sort();
}

function union (zvs, branchId, idsA, idsB) {
    var r = uniq_fast((idsA || []).concat(idsB || []));

    r = r.map(function (o) {
        return zvs.getObject(branchId, o);
    });
    
    return r;
}

module.exports = {
    clone: clone,
    query: query,
    definitions: definitions,
    copyWithVars: copyWithVars,
    union: union,
    uniq_fast: uniq_fast
};

},{}],9:[function(require,module,exports){
/*function include (readFile) {
    const files = [];
    
    return function ({data:filename}) {
        if (files.indexOf(filename) === -1) {
            files.push(filename);
            return readFile(filename).then(function (text) {
                return {value: text};
            });
        }
        else {
            return Promise.resolve({});
        }
    };
}*/

function include (req, res) {
    
    const filename = req.args.data;
    const files = req.store.files;
        
    if (files.indexOf(filename) === -1) {
        files.push(filename);
        return req.context.readFile(filename).then(function (text) {
            res.send({value: text});
        });
    }
    else {
        res.send({});
    }
}


module.exports = include;

},{}],10:[function(require,module,exports){
const include = require("./include");
const parse = require("./parse");


const {check} = require("./check");
const merge = require("./merge");
const negations = require("./negations");

/*
Definitions
*/
const prepareDefinitions = require("./definitions/prepare-definitions");
const checkDefinitions = require("./definitions/check-definitions");
const multiplyDefinitions = require("./definitions/multiply-definitions");
/*
    Query,
*/
const prepareQuery = require("./query/prepare-query");
const checkDepth = require("./query/check-depth");
const updateQuery = require("./query/update-query");
const filterUncheckedNegations = require("./negations/filter-unchecked-negations");
const filterUncheckedTuples = require("./query/filter-unchecked-tuples");

/*
    Unify
*/
const matchTuples = require("./unify/match-tuples");
const copyDefinitions = require("./unify/copy-definitions");

module.exports = {
    include,
    parse,
    check,
    merge,
    negations,

    // definitions,
    prepareDefinitions,
    checkDefinitions,
    multiplyDefinitions,
    
    // query
    prepareQuery,
    checkDepth,
    updateQuery,
    filterUncheckedTuples,
    
    // Unify
    matchTuples,
    copyDefinitions,
    
    // negations,
    filterUncheckedNegations
};


},{"./check":4,"./definitions/check-definitions":5,"./definitions/multiply-definitions":6,"./definitions/prepare-definitions":7,"./include":9,"./merge":11,"./negations":12,"./negations/filter-unchecked-negations":13,"./parse":14,"./query/check-depth":15,"./query/filter-unchecked-tuples":16,"./query/prepare-query":17,"./query/update-query":18,"./unify/copy-definitions":20,"./unify/match-tuples":21}],11:[function(require,module,exports){
const actionUnify = require("./unify");
const utils = require("../../utils");

function intersections (zvs, aBranches, bBranches) {
    const ids = {};
    var hits = 0;
    
    for (var i=0; i<aBranches.length; i++) {
        const branch = zvs.branches.getRawBranch(aBranches[i]);
        
        for (var id in branch.metadata.changes) {
            ids[id] = true;
            ids[branch.metadata.changes[id]] = true;
        }
    }
    
    
    for (var i=0; i<bBranches.length; i++) {
        const branch = zvs.branches.getRawBranch(bBranches[i]);
        
        for (var id in branch.metadata.changes) {
            if (ids[id] || ids[branch.metadata.changes[id]]) {
                hits++;
            }
        }
    }
    
    return hits / bBranches.length;
}


function select (zvs, value) {
    // get all branches intersect, 
    // choose 2 that have higth intersect number.

    var results = [];

    for (var i=0; i<value.length; i++) {
        const aBranches = value[i];
        
        for (var j=i+1; j<value.length; j++) {
            const bBranches = value[j];
            const rs = aBranches.length * bBranches.length;
    
            const hits = intersections(zvs, aBranches, bBranches);
    
            if (hits > 0) {
                results.push({
                    branches: {
                        a: aBranches,
                        b: bBranches
                    },
                    index: {i, j},
                    rs,
                    hits
                });
            }
        }
    }

    if (results.length > 0) {
        results.sort(function (a, b) {
           return b.hits - a.hits || a.rs - b.rs;
        });

        // console.log(results.length + " % " + value.length + " => " + results.map(r => r.hits + "::" + (r.branches.a.length * r.branches.b.length)).join(", "));
        // console.log(JSON.stringify(results, null, '\t'));
        
        const r = results[0];

        value.splice(r.index.j, 1);
        value.splice(r.index.i, 1);
        
        return r.branches;
    }

    value.sort(function (a, b) {
        return a.length - b.length;
    });    
    
    // console.log("L = " + value.map(r => r.length).join(", "));
    
    return {
        a: value.shift(),
        b: value.shift()
    };
    
}

function merge (req, res) {
    const {zvs} = req.context;
    const {branches} = req.args;
    
    const results = [];
    
    /*
        we need to make sure that single branches 
        pass the merge phase.
    */
    const singles = [];

    for (let i=branches.length-1; i>=0; i--) {
        const bs = branches[i];
        
        if (bs.length === 1) {
            singles.push(bs[0]);
            branches.splice(i, 1);
        }
    }

    if (singles.length) {
        while (singles.length > 1) {
            const bA = singles.pop();
            const bB = singles.pop();

            const s = zvs.merge(
                [bA, bB], 
                (...args) => actionUnify(...args),
                "unify&merge"
            );
            
            if (s) {
                singles.push(s[0]);
            }
            else {
                res.send({});
                return;
            }
        }
        
        if (branches.length === 1) {
            branches.push(singles);
        }
        else {
            results.push(singles);
        }
    }

    while (branches.length > 1) {
        const {a, b} = select(zvs, branches);

        if (a.length * b.length < 100) {

            let nr = [];
        
            for (let i=0; i<a.length; i++) {
                const bA = a[i];
        
                for (let j=0; j<b.length; j++) {
                    var bB = b[j];
                        
                    // bA * bB
                    let bs = zvs.merge(
                        [bA, bB], 
                        (...args) => actionUnify(...args),
                        "unify&merge"
                    );
                        
                    if (bs && bs.length) {
                        nr = nr.concat(bs);
                    }
                }
            }
            
            if (nr.length === 0) {
                // everything fails,
                // fail,
                // TODO: we need to fail father branch,
                // zvs.branches.notes(branchId, {status: {fail: true, reason: "merge fail!"}});
                
                res.send({});
                return;
            }
            
            results.push(nr);
        }
        else {
            branches.push(a.length < b.length?a:b);
        }
    }

    if (branches.length > 0) {
        results.push(branches[0]);
    }

    res.send({value: {branches: results}});
}

module.exports = merge;

},{"../../utils":24,"./unify":19}],12:[function(require,module,exports){

const utils = require("../../utils");

function hasVariables (zvs, branchId, tupleId) {
    const tuples = [tupleId];
    var all = [];
    
    while (tuples.length > 0) {
        const tupleId = tuples.pop();
        
        const tuple = zvs.getData(branchId, tupleId);
        const data = zvs.getData(branchId, tuple.data);
        
        for (let i=0; i<data.length; i++) {
            const id = data[i];
            const v = zvs.getData(branchId, id);
            const type = zvs.getData(branchId, v.type);
            
            if (type === 'variable') {
                return true;
            }
            else if (type === 'tuple' && all.indexOf(id) === -1) {
                tuples.push(id);
                all.push(id);
            }
        }
    }
    
    return false;
}

function negations (req, res) {
    const {zvs, exists} = req.context;
    const {branches, negations: negs, branchId} = req.args;

    if (negs.length === 0) {
        if (branchId) {
            res.send({value: {branchId}});
        }
        else if (branches.length > 1) {
            res.send({value: {branches}});
        }
        else {
            res.send({values: branches[0]});
        }
        
        return;
    }
    
    const execute = branchId !== undefined;

    const evalAllNegations = [];

    for (let i=0; i<negs.length; i++) {
        const {branchId, negations: nots, branches} = negs[i];
        const evalBranchNegations = [];

        for (let j=nots.length-1; j>=0; j--) {
            const tupleId = nots[j];

            if (execute || !hasVariables(zvs, branchId, tupleId)) {
                // execute tupleId,
                // evalBranchNegations.push(runQuery(zvs, events, branchId, tupleId, abort));
                nots.splice(j, 1);
                evalBranchNegations.push(exists(branchId, tupleId));
            }
        }
        
        evalAllNegations.push(
            Promise.all(evalBranchNegations).then((ids) => {
                // Everything is ok,
                /*const ns = zvs.getObject(branchId, zvs.getData(branchId, zvs.data.global("query")).negation);

                // update negations,
                zvs.update(branchId, zvs.data.global("query"), {
                    negation: ns
                });*/
                
                return true;
            }, () => {
                // at least one of negations has failed, we need to remove branch,
                const index = branches.indexOf(branchId);
                branches.splice(index, 1);
                
                if (branches.length === 0) {
                    return Promise.reject();
                }
                
                return Promise.resolve();
            })
        );
    }
    
    Promise.all(evalAllNegations).then(() => {
        if (branchId) {
            res.send({value: {branchId}});
        }
        else if (branches.length > 1) {
            res.send({value: {branches}});
        }
        else {
            res.send({values: branches[0]});
        }
    }, () => {
        res.send({});
    });
}

module.exports = negations;

},{"../../utils":24}],13:[function(require,module,exports){
const utils = require("../../../utils");

function filterUncheckedNegations (req, res) {
    let {branches, branchId} = req.args;
    const {zvs} = req.context;

    branches = branches || [[branchId]];

    const results = {
        branches,
        negations: [],
        branchId
    };

    const queryId = zvs.data.global("query");

    for (let i=0; i<branches.length; i++) {
        const bs = branches[i];
        
        for (let j=0; j<bs.length; j++) {
            const branchId = bs[j];
            
            let nots = zvs.getData(branchId, zvs.getData(branchId, queryId).negation);
                
            if (nots) {
                nots = nots.filter(n => zvs.getData(branchId, zvs.getData(branchId, n).exists) === undefined);
            }
            
            if (nots && nots.length) {
                results.negations.push({branchId, negations: nots, branches: bs});
            }
        }
    }
    
    res.send({value: results});

}

module.exports = filterUncheckedNegations;


},{"../../../utils":24}],14:[function(require,module,exports){
const {parse: zparse} = require("../../zparser");

/*
function parse (text) {
    return new Promise(function (resolve, reject) {
        var parsed;
        try {
            parsed = zparse(text);
        }
        catch (e) {
            // TODO: make kanban handle errors,
            // or handle errors on manager as a special value.
            console.log("Exception (l=" + e.line + ", c="+ e.column + ") " + e.message);
        }
        
        resolve({values: parsed});
    });
}*/

function parse(req, res) {
    var parsed;
    const text = req.args;
    
    try {
        parsed = zparse(text);
    }
    catch (e) {
        // TODO: make kanban handle errors,
        // or handle errors on manager as a special value.
        console.log("Exception (l=" + e.line + ", c="+ e.column + ") " + e.message);
    }
        
    res.send({values: parsed});
}

module.exports = parse;
},{"../../zparser":26}],15:[function(require,module,exports){
function checkDepth (req, res) {
    const branchId = req.args;
    const {zvs} = req.context;

    const settings = zvs.getObject(branchId, zvs.data.global("settings"));
            
    if (settings && settings.data && settings.data.depth !== undefined) {
        const branch = zvs.branches.getRawBranch(branchId);
        if (branch.data.level > settings.data.depth) {
            zvs.branches.end({branchId, fail: true, reason: "max depth reached"});
            res.send({});
            return;
        }
    }
    
    res.send({value: branchId});
}

module.exports = checkDepth;

},{}],16:[function(require,module,exports){
function getUncheckedTuples (zvs, branchId, q, tuples) {
    // normalize id,
    q = zvs.branches.getDataId(branchId, q);
    
    tuples = tuples || [];

    if (tuples.indexOf(q) === -1) {
        var d = zvs.getData(branchId, q);
    
        if (zvs.getData(branchId, d.type) === 'tuple') {
            if (!d.check || !zvs.getData(branchId, d.check)) {
                tuples.push(q);
            }
            
            var data = zvs.getData(branchId, d.data);
            for (var i=0; i<data.length; i++) {
                getUncheckedTuples(zvs, branchId, data[i], tuples);
            }
        }
    }

    return tuples;
}

function filterUncheckedTuples (req, res) {
    const {branchId, queryId} = req.args;
    const {zvs} = req.context;
    
    const tuples = getUncheckedTuples (zvs, branchId, queryId);

    if (tuples) {
        res.send({
            value: {
                branchId,
                tuples
            }
        });
    }
    else {
        res.send({});
    }
}

module.exports = filterUncheckedTuples;


},{}],17:[function(require,module,exports){
const prepare = require("../definitions/prepare");
const Match = require("../../../match/match");

function prepareQuery (req, res) {
    
    function genId () {
        return "id$" + req.store.id++;
    }
    
    const {query, definitions} = req.args;
    const {zvs, events} = req.context;
    
    const definitionsId = zvs.data.add(definitions);
    
    const definitionsBranchId = zvs.branches.getId({
	    parent: zvs.branches.root,
		args: [definitionsId],
		action: 'definitions'
    }).branchId;
    
    zvs.branches.transform(
        definitionsBranchId, 
        zvs.data.global("definitions"), 
        zvs.data.add({
            type: 'definitions',
            data: {
                definitions,
                branchId: definitionsBranchId
            }
        })
    );

    const match = new Match(zvs);
    
    const definitionsIds = zvs.getData(definitionsBranchId, definitionsId);
    
    match.addTuples(definitionsIds);
    zvs.addDefinitionsMatch(definitionsBranchId, match);
    
    
    const preparedQuery = prepare.copyWithVars(query.data, genId);
    const queryId = zvs.data.add(preparedQuery);
        
    const {branchId: queryBranchId} = zvs.branches.getId({
	    parent: definitionsBranchId,
		args: [queryId],
		action: 'query',
		func: query.func
    });
    
    zvs.branches.transform(
        queryBranchId, 
        zvs.data.global("queryBranchId"),
        zvs.data.add({
            type: 'query',
            data: queryBranchId
        })
    );

    zvs.branches.transform(queryBranchId, zvs.data.global("query"), queryId);
        
    events.trigger('query-start', queryBranchId);

    // res.send({value: {queryBranchId, definitionsBranchId}, trackId: queryBranchId});
    res.send({value: queryBranchId});
}

module.exports = prepareQuery;

},{"../../../match/match":22,"../definitions/prepare":8}],18:[function(require,module,exports){
const utils = require("../../../utils");

function updateQuery (req, res) {
    const branchId = req.args;
    const {zvs} = req.context;
/*
    const queryId = zvs.getUpdatedId(branchId, zvs.data.global("query"));
            
    if (!queryId) {
        res.send({});
        return;
    }
*/    
    const queryId = zvs.branches.getDataId(branchId, zvs.data.global("query"));
    
    // utils.printQuery(zvs, branchId, "Query");
    
    res.send({value: {branchId, queryId}});
}

module.exports = updateQuery;

},{"../../../utils":24}],19:[function(require,module,exports){
const unify = require("../../unify");

function actionUnify (zvs, {branchId: parentBranchId, args: [p, q]}) {
	const parent = zvs.branches.getRawBranch(parentBranchId);
	
	if (parent.metadata) {
	    Object.freeze(parent.metadata.changes);
	}
	
	const branchId = zvs.branches.getId({
	    parent: parentBranchId,
		args: [p, q],
		action: "unify",
		level: parent.data.level + 1
	}).branchId;
	
	const r = unify(zvs, branchId, p, q);

	if (!r) {
		zvs.branches.end({branchId, fail: true, reason: "unify fail!"});
	}
	
	return r;
}

module.exports = actionUnify;


},{"../../unify":23}],20:[function(require,module,exports){
const prepare = require("../definitions/prepare");

function copyDefinitions (req, res) {
    const copyTupleDefinitions = [];
    const {zvs} = req.context;
    const {branchId, tuples} = req.args;
    
    for (var i=0; i<tuples.length; i++) {
        const tuple = tuples[i].tuple;
        var tupleDefs;
                
        tupleDefs = tuples[i].definitions;

        var t = [];
        for (var j=0; j<tupleDefs.length; j++) {
            var c = prepare.copyWithVars(
                zvs.getObject(branchId, tupleDefs[j]),
                function () {
                    return zvs.branches.getUniqueId(branchId);
                }
            );

            var negation = c.negation;
                    
            delete c.negation;
            var def = zvs.data.add(c);
                    
            t.push({
                negation: negation,
                definition: def
            });
        }
                
        copyTupleDefinitions.push({
            tuple,
            definitions: t
        });
    }

    res.send({value: {
        branchId,
        tuples: copyTupleDefinitions
    }});
}


module.exports = copyDefinitions;

},{"../definitions/prepare":8}],21:[function(require,module,exports){
function getTuplesDefinitions (branchId, tuples, match) {
    const matchTuples = {};
    
    for (let i=0; i<tuples.length; i++) {
        const tupleID = tuples[i];
        var definitions = match.match(branchId, tupleID);
        
        if (definitions && definitions.length) {
            matchTuples[tupleID] = definitions;
        }
        else {
            return;
        }
    }
    
    return matchTuples;
}

function matchTuples (req, res) {
    const {branchId, tuples} = req.args;
    const {zvs} = req.context;

    const ddata = zvs.getData(branchId, zvs.data.global("definitions")).data;
    const definitionsBranchId = zvs.getData(branchId, zvs.getData(branchId, ddata).branchId);
    const match = zvs.definitionsMatch[definitionsBranchId];
    
    // Get tuples definitions,
    const matchTuples = getTuplesDefinitions(branchId, tuples, match);

    if (!matchTuples) {
        res.send({});
        return;
    }
    
    const tuplesDefinitions = tuples.map(tuple => {
        return {
            tuple,
            definitions: matchTuples[tuple]
        };
    });
    
    if (tuplesDefinitions) {
        res.send({
            value: {
                branchId,
                tuples: tuplesDefinitions
            }
        });
    }
    else {
        res.send({});
    }
}

module.exports = matchTuples;


},{}],22:[function(require,module,exports){
const Ids = require("../zvs/ids");
const utils = require("../utils");

const TYPE_CONSTANT = 0;
const TYPE_VARIABLE = 1;
const TYPE_TUPLE = 2;

const types = {
    'constant': 0,
    'variable': 1,
    'tuple': 2
};

class Match {
    
    constructor (zvs) {
        this.zvs = zvs;
        this.symbols = new Ids();
        this.stateIDs = new Ids();
        this.states = {};
        this.start = this.stateIDs.id([]);
        this.transitions = {};
    }
    
    transition (from, symbol, to) {
        const t = this.transitions[from] = this.transitions[from] || {};
        const s = t[symbol] = t[symbol] || [];
        if (s.indexOf(to) === -1) {
            s.push(to);
        }
    }
    
    getStateJoinID (states) {
        if (states.length > 1) {
            const tuples = [];

            states.forEach(s => {
                const state = this.states[s];

                state.forEach(t => {
                   if (tuples.indexOf(t) === -1) {
                       tuples.push(t);
                   }
                });
                
                tuples.sort();
            });
            
            const stateID = this.stateIDs.id(tuples);
            
            this.states[stateID] = tuples;
            return stateID;
        }
        else {
            return states[0];
        }
    }
    
    add (tupleID, variables) {
        /*
        {Position, Variable, Length} => id,
        {Position, Constant:value, Length} => id,
        {Position, Tuple, Length} => id.
        */
        
        // Create state,
        const stateData = [tupleID];
        const stateID = this.stateIDs.id(stateData);
        this.states[stateID] = stateData;
        
        const tuple = this.zvs.getObject(this.zvs.branches.root, tupleID);
        
        // Start transition,
        this.transition(
            this.start, 
            this.symbols.id({
                type: TYPE_TUPLE,
                length: tuple.data.length
            }),
            stateID
        );
        
        var value;
        for (var i=0; i<tuple.data.length; i++) {
                        
            const v = tuple.data[i];
            value = undefined;            
            
            if (v.type === 'variable') {
                variables[tuple.data.length] = variables[tuple.data.length] || {};
                const s = variables[tuple.data.length][i] = variables[tuple.data.length][i] || {
                    variables: [],
                    symbols: []
                };
                
                s.variables.push(stateID);
            }
            else if (v.type === 'constant') {
                value = v.data;
            }
            else if (v.type === 'tuple') {
                value = v.data.length;
            }

            const symbol = this.symbols.id({
                position: i,
                type: types[v.type],
                value,
                length: tuple.data.length
            });
            
            variables[tuple.data.length] = variables[tuple.data.length] || {};
            
            const s = variables[tuple.data.length][i] = variables[tuple.data.length][i] || {
                variables: [],
                symbols: []
            };

            if (s.symbols.indexOf(symbol) === -1) {
                s.symbols.push(symbol);
            }
            
            variables[tuple.data.length][i].symbols.push(symbol);

            this.transition(this.start, symbol, stateID);
            this.transition(stateID, symbol, stateID);
        }
    }
    
    
    isLoop (g, t) {
        const done = g[t].slice();
        const tuples = done.slice();

        if (tuples) {
            while (tuples.length) {
                const tuple = tuples.pop();
                
                if (tuple === t) {
                    return true;
                }
                
                // Insert all tuples from graph relations.
                g[tuple].forEach(t => {
                    if (done.indexOf(t) === -1) {
                        done.push(t);
                        tuples.push(t);
                    }
                });
            }
        }
        
        return false;
    }

    graph (tuples, branchId) {
        const g = {};
        const loops = {};
        
        branchId = branchId || this.zvs.branches.root;
        
        tuples.forEach(t => {
            const tuple = this.zvs.getData(branchId, t);
            const data = this.zvs.getData(branchId, tuple.data);
            
            g[t] = [];
            
            for (let i=0; i<data.length; i++) {
                const dID = data[i];
                const type = this.zvs.getData(branchId, this.zvs.getData(branchId, dID).type);
                
                if (type === 'tuple') {
                    const mt = this.match(branchId, dID);
                    
                    if (mt) {
                        mt.forEach(m => {
                            if (g[t].indexOf(m) === -1) {
                                g[t].push(m);
                            }
                        });
                    }
                    /*
                    Unfortunately some are generated by multiply process, ... we need to remove them, so we can test the user definitions.
                    
                    else {
                        throw "Definition " + utils.toString(this.zvs.getObject(branchId, t)) + " will always fail because of subtuple " + utils.toString(this.zvs.getObject(branchId, dID));
                    }*/
                }
            }
        });

        tuples.forEach(t => {
            loops[t] = this.isLoop(g, t);
        });
        
        /*
        for (var i in loops) {
            if (loops[i]) {
                console.log(utils.toString(this.zvs.getObject(this.zvs.branches.root, +i), true));
            }
        }
        
        console.log(JSON.stringify(loops));*/
        
        return {graph: g, loops};
    }

    addTuples (tuples) {
        const variables = {};
        
        tuples.forEach(t => {
           this.add(t, variables);
        });
        
        // Create symbol variable transitions,
        for (var variable in variables) {
            const positions = variables[variable];
            for (var position in positions) {
                const vs = positions[position];
                
                if (vs.variables.length > 0 && vs.symbols.length > 0) {
                    vs.variables.forEach(state => {
                        vs.symbols.forEach(symbol => {
                           this.transition(this.start, symbol, state);
                           this.transition(state, symbol, state);
                        });
                    });
                }
            }
        }
        
        // mk automata determinitic.
        this.deterministic();
        
        // set tos states to to.
        for (var from in this.transitions) {
            const symbols = this.transitions[from];
            for (var symbol in symbols) {
                symbols[symbol] = symbols[symbol][0];
            }
        }

        this.g = this.graph(tuples);
        // TODO: clean up unused states,
    }
 
    deterministic (stateID) {
        stateID = stateID || this.start;
        
        const symbols = this.transitions[stateID];
        
        if (!symbols) {
            return;
        }
        
        for (var symbol in symbols) {
            const states = symbols[symbol];
            
            if (states.length > 1) {
                const joinID = this.getStateJoinID(states);

                if (!this.transitions[joinID]) {
                    states.forEach(n => {
                        const symbols = this.transitions[n];
                        if (symbols) {
                            for (var symbol in symbols) {
                                const tos = symbols[symbol];
                                tos.forEach(t => {
                                    this.transition(joinID, symbol, t);
                                });
                            }
                        }
                    });
                }
                
                symbols[symbol] = [joinID];
                this.deterministic(joinID);
            }
        }
    }

    getState (from, value) {
        const symbol = this.symbols.id(value);
        
        if (symbol) {
            const to = this.transitions[from][symbol];
            if (to === undefined && value.value !== undefined && value.position !== undefined) {
               // If is a value then try variable.
               const symbol = this.symbols.id({
                   position: value.position,
                   type: TYPE_VARIABLE,
                   value: undefined,
                   length: value.length
               });
               
               return this.transitions[from][symbol];
            }
            
            return to;
        }
    }

    match (branchId, tupleID) {
        const tuple = this.zvs.getData(branchId, tupleID);
        const tupleData = this.zvs.getData(branchId, tuple.data);
        
        const length = tupleData.length;
        
        var from = this.getState(this.start, {
            type: TYPE_TUPLE,
            length
        });
    
        var value;

        if (from !== undefined) {
            for (var i=0; i<length; i++) {
                    
                const id = tupleData[i];
    
                value = undefined;
                const v = this.zvs.getData(branchId, id);
                const type = this.zvs.getData(branchId, v.type);
                const data = this.zvs.getData(branchId, v.data);
                
                if (type === 'constant') {
                    value = data;
                }
                else if (type === 'tuple') {
                    value = data.length;
                }

                if (value) {
                    from = this.getState(from, {
                        position: i,
                        type: types[type],
                        value,
                        length
                    });
                }
                
                if (from === undefined) {
                    // There is no matching tuples,
                    return;
                }
            }
        
            // Put all definitions on result.
            // Return a copy of defintions array,
            return this.states[from].slice();
        }
    }
}

module.exports = Match;


},{"../utils":24,"../zvs/ids":29}],23:[function(require,module,exports){
// const negation = require("./negation");
const prepare = require("./manager/transitions/definitions/prepare");

// const utils = require("./utils");

function tupleXtuple (zvs, branchId, p, q) {
    var po = zvs.getData(branchId, p);
    var qo = zvs.getData(branchId, q);

    var pData = zvs.getData(branchId, po.data);
    var qData = zvs.getData(branchId, qo.data);

    if (pData.length === qData.length) {
        for (var i=0; i<pData.length; i++) {
            if (!unify(zvs, branchId, pData[i], qData[i])) {
                return;                
            }
        }

        return true;
    }
    
}

function variableXall (zvs, branchId, p, q) {
    zvs.branches.transform(branchId, p, q);
    return true;
}

function allXvariable (zvs, branchId, p, q) {
    zvs.branches.transform(branchId, q, p);
    return true;
}

var table = {
    "tuple": {
        "tuple": tupleXtuple,
        "variable": allXvariable
    },
    "variable": {
        "tuple": variableXall,
        "variable": variableXall,
        "constant": variableXall
    },
    "constant": {
        "variable": allXvariable
    }
};


function update (zvs, branchId, p, q) {
    var po = zvs.getData(branchId, p);
    var qo = zvs.getData(branchId, q);

    var updateData = {
        check: zvs.getData(branchId, po.check) || zvs.getData(branchId, qo.check)
    };

    var doUpdate = updateData.check;
    var ns = prepare.union(zvs, branchId, zvs.getData(branchId, po.negation) || [], zvs.getData(branchId, qo.negation) || []);

    if (ns && ns.length > 0) {
        updateData.negation = ns;
        doUpdate = true;
    }

    if (doUpdate) {
        zvs.update(branchId, p, updateData);
        zvs.update(branchId, q, updateData);
    }
    
    return true;
}

function unify (zvs, branchId, p, q, evalNegation) {
    p = zvs.branches.getDataId(branchId, p);
    q = zvs.branches.getDataId(branchId, q);

    var po = zvs.getData(branchId, p);
    var qo = zvs.getData(branchId, q);
    var r = true;
    
    if (p !== q) {
        var pt = zvs.getData(branchId, po.type);
        var qt = zvs.getData(branchId, qo.type);

        if (table[pt] && table[pt][qt]) {
            r = table[pt][qt](zvs, branchId, p, q, evalNegation);
        }
        else {
            r = false;
        }
    }

    if (!r) {
        // zvs.branches.end(branchId, true, "unify fail!");
        return;
    }

    if (!update(zvs, branchId, p, q)) {
        return;
    }

    return branchId;
}

module.exports = unify;

},{"./manager/transitions/definitions/prepare":8}],24:[function(require,module,exports){

function toString (p, debug) {

    function ts (v) {
        return toString(v, debug);
    }

    if (!p) {
        return "";
    }

    switch (p.type) {
        case "tuple":
            return (debug?(p.loop && !p.check?"*":""):"") + (debug?(p.check?"@":""):"") + (debug?(p.exists === false?"!":""):"") + "(" + p.data.map(ts).join(" ") + ")"
                + (p.negation && p.negation.length?"[^" + toString(p.negation, debug) + "]":"");

        case "constant":
            return p.data;

        case "variable":
            return "'" + (p.data || ""); // + (debug?":" + p.id:"");

        default:
            if (p.map) {
                return p.map(ts).sort().join("\n");
            }
    }
}

function printQuery (zvs, branchId, text) {
    console.log((text?text + " => ":"") + toString(zvs.getObject(branchId, zvs.data.global("query")), true));
}

module.exports = {
    toString: toString,
    printQuery: printQuery
};


},{}],25:[function(require,module,exports){
const Session = require("./manager/manager");

"#if DEBUG";
    console.log("DEBUG IS ON!!");
"#endif";

module.exports = Session;

},{"./manager/manager":3}],26:[function(require,module,exports){
/*
 * Generated by PEG.js 0.10.0.
 *
 * http://pegjs.org/
 */

"use strict";

function peg$subclass(child, parent) {
  function ctor() { this.constructor = child; }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor();
}

function peg$SyntaxError(message, expected, found, location) {
  this.message  = message;
  this.expected = expected;
  this.found    = found;
  this.location = location;
  this.name     = "SyntaxError";

  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(this, peg$SyntaxError);
  }
}

peg$subclass(peg$SyntaxError, Error);

peg$SyntaxError.buildMessage = function(expected, found) {
  var DESCRIBE_EXPECTATION_FNS = {
        literal: function(expectation) {
          return "\"" + literalEscape(expectation.text) + "\"";
        },

        "class": function(expectation) {
          var escapedParts = "",
              i;

          for (i = 0; i < expectation.parts.length; i++) {
            escapedParts += expectation.parts[i] instanceof Array
              ? classEscape(expectation.parts[i][0]) + "-" + classEscape(expectation.parts[i][1])
              : classEscape(expectation.parts[i]);
          }

          return "[" + (expectation.inverted ? "^" : "") + escapedParts + "]";
        },

        any: function(expectation) {
          return "any character";
        },

        end: function(expectation) {
          return "end of input";
        },

        other: function(expectation) {
          return expectation.description;
        }
      };

  function hex(ch) {
    return ch.charCodeAt(0).toString(16).toUpperCase();
  }

  function literalEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function classEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/\]/g, '\\]')
      .replace(/\^/g, '\\^')
      .replace(/-/g,  '\\-')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function describeExpectation(expectation) {
    return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
  }

  function describeExpected(expected) {
    var descriptions = new Array(expected.length),
        i, j;

    for (i = 0; i < expected.length; i++) {
      descriptions[i] = describeExpectation(expected[i]);
    }

    descriptions.sort();

    if (descriptions.length > 0) {
      for (i = 1, j = 1; i < descriptions.length; i++) {
        if (descriptions[i - 1] !== descriptions[i]) {
          descriptions[j] = descriptions[i];
          j++;
        }
      }
      descriptions.length = j;
    }

    switch (descriptions.length) {
      case 1:
        return descriptions[0];

      case 2:
        return descriptions[0] + " or " + descriptions[1];

      default:
        return descriptions.slice(0, -1).join(", ")
          + ", or "
          + descriptions[descriptions.length - 1];
    }
  }

  function describeFound(found) {
    return found ? "\"" + literalEscape(found) + "\"" : "end of input";
  }

  return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};

function peg$parse(input, options) {
  options = options !== void 0 ? options : {};

  var peg$FAILED = {},

      peg$startRuleFunctions = { z: peg$parsez },
      peg$startRuleFunction  = peg$parsez,

      peg$c0 = function(definition, z) {
          	return [definition].concat(z);
          },
      peg$c1 = function(definition) {
          	return [definition];
          },
      peg$c2 = function(query) {return query},
      peg$c3 = function(tuple) {return tuple;},
      peg$c4 = function(file) {return file},
      peg$c5 = "[",
      peg$c6 = peg$literalExpectation("[", false),
      peg$c7 = /^[^\]]/,
      peg$c8 = peg$classExpectation(["]"], true, false),
      peg$c9 = "]",
      peg$c10 = peg$literalExpectation("]", false),
      peg$c11 = function(file) {return {type: "include", data: file.join('')}},
      peg$c12 = "?",
      peg$c13 = peg$literalExpectation("?", false),
      peg$c14 = function(tuple, func) {
          	return {type: 'query', data: tuple, func: func}
        },
      peg$c15 = "{%",
      peg$c16 = peg$literalExpectation("{%", false),
      peg$c17 = "%}",
      peg$c18 = peg$literalExpectation("%}", false),
      peg$c19 = peg$anyExpectation(),
      peg$c20 = function(body) { return body.map(function (t) {return t.join("")}).join("");},
      peg$c21 = "(",
      peg$c22 = peg$literalExpectation("(", false),
      peg$c23 = ")",
      peg$c24 = peg$literalExpectation(")", false),
      peg$c25 = function(terms) {
      		var t = {
              	type: 'tuple', 
                  data: terms.filter(function (v) {
                  	return v.type !== 'not';
                 	}),
                  negation: terms.filter(function (v) {
                      return v.type === 'not';
                  }).map(function (v) {
                    return v.data;
                  })
      		};

      		if (t.negation.length === 0) {
      		  delete t.negation;
      		}
      		
      		return t;
      	},
      peg$c26 = "()",
      peg$c27 = peg$literalExpectation("()", false),
      peg$c28 = function() {return {type: "tuple", data: []}},
      peg$c29 = function(term, terms) {
          	return [term].concat(terms);
      	},
      peg$c30 = function(term) {
          	return [term]
          },
      peg$c31 = "^",
      peg$c32 = peg$literalExpectation("^", false),
      peg$c33 = function(tuple) {
            return {
                type: 'not',
                data: tuple
            }
      	},
      peg$c34 = "'",
      peg$c35 = peg$literalExpectation("'", false),
      peg$c36 = /^[_a-zA-Z0-9{}]/,
      peg$c37 = peg$classExpectation(["_", ["a", "z"], ["A", "Z"], ["0", "9"], "{", "}"], false, false),
      peg$c38 = function(varname) {
            if (varname.length > 0) {
                return {type: 'variable', data: varname.join("")};
            }

            return {type: 'variable'};
      	},
      peg$c39 = "/*",
      peg$c40 = peg$literalExpectation("/*", false),
      peg$c41 = /^[^ \n\t()'\^]/,
      peg$c42 = peg$classExpectation([" ", "\n", "\t", "(", ")", "'", "^"], true, false),
      peg$c43 = function(constant) {
          	return {type: 'constant', data: constant.join("")};
        	},
      peg$c44 = "*/",
      peg$c45 = peg$literalExpectation("*/", false),
      peg$c46 = "#",
      peg$c47 = peg$literalExpectation("#", false),
      peg$c48 = /^[^\n\r]/,
      peg$c49 = peg$classExpectation(["\n", "\r"], true, false),
      peg$c50 = /^[\n\r]/,
      peg$c51 = peg$classExpectation(["\n", "\r"], false, false),
      peg$c52 = /^[ \t\n\r]/,
      peg$c53 = peg$classExpectation([" ", "\t", "\n", "\r"], false, false),
      peg$c54 = peg$otherExpectation("whitespace"),

      peg$currPos          = 0,
      peg$savedPos         = 0,
      peg$posDetailsCache  = [{ line: 1, column: 1 }],
      peg$maxFailPos       = 0,
      peg$maxFailExpected  = [],
      peg$silentFails      = 0,

      peg$result;

  if ("startRule" in options) {
    if (!(options.startRule in peg$startRuleFunctions)) {
      throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
    }

    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
  }

  function text() {
    return input.substring(peg$savedPos, peg$currPos);
  }

  function location() {
    return peg$computeLocation(peg$savedPos, peg$currPos);
  }

  function expected(description, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildStructuredError(
      [peg$otherExpectation(description)],
      input.substring(peg$savedPos, peg$currPos),
      location
    );
  }

  function error(message, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildSimpleError(message, location);
  }

  function peg$literalExpectation(text, ignoreCase) {
    return { type: "literal", text: text, ignoreCase: ignoreCase };
  }

  function peg$classExpectation(parts, inverted, ignoreCase) {
    return { type: "class", parts: parts, inverted: inverted, ignoreCase: ignoreCase };
  }

  function peg$anyExpectation() {
    return { type: "any" };
  }

  function peg$endExpectation() {
    return { type: "end" };
  }

  function peg$otherExpectation(description) {
    return { type: "other", description: description };
  }

  function peg$computePosDetails(pos) {
    var details = peg$posDetailsCache[pos], p;

    if (details) {
      return details;
    } else {
      p = pos - 1;
      while (!peg$posDetailsCache[p]) {
        p--;
      }

      details = peg$posDetailsCache[p];
      details = {
        line:   details.line,
        column: details.column
      };

      while (p < pos) {
        if (input.charCodeAt(p) === 10) {
          details.line++;
          details.column = 1;
        } else {
          details.column++;
        }

        p++;
      }

      peg$posDetailsCache[pos] = details;
      return details;
    }
  }

  function peg$computeLocation(startPos, endPos) {
    var startPosDetails = peg$computePosDetails(startPos),
        endPosDetails   = peg$computePosDetails(endPos);

    return {
      start: {
        offset: startPos,
        line:   startPosDetails.line,
        column: startPosDetails.column
      },
      end: {
        offset: endPos,
        line:   endPosDetails.line,
        column: endPosDetails.column
      }
    };
  }

  function peg$fail(expected) {
    if (peg$currPos < peg$maxFailPos) { return; }

    if (peg$currPos > peg$maxFailPos) {
      peg$maxFailPos = peg$currPos;
      peg$maxFailExpected = [];
    }

    peg$maxFailExpected.push(expected);
  }

  function peg$buildSimpleError(message, location) {
    return new peg$SyntaxError(message, null, null, location);
  }

  function peg$buildStructuredError(expected, found, location) {
    return new peg$SyntaxError(
      peg$SyntaxError.buildMessage(expected, found),
      expected,
      found,
      location
    );
  }

  function peg$parsez() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parsedefinition();
    if (s1 !== peg$FAILED) {
      s2 = peg$parsez();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c0(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsedefinition();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c1(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parsedefinition() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parse_();
    if (s1 !== peg$FAILED) {
      s2 = peg$parsequery();
      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c2(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parse_();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsetuple();
        if (s2 !== peg$FAILED) {
          s3 = peg$parse_();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c3(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parse_();
        if (s1 !== peg$FAILED) {
          s2 = peg$parseinclude();
          if (s2 !== peg$FAILED) {
            s3 = peg$parse_();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c4(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseinclude() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 91) {
      s1 = peg$c5;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c6); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c7.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c8); }
      }
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$c7.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c8); }
          }
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 93) {
          s3 = peg$c9;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c10); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c11(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsequery() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 63) {
      s1 = peg$c12;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c13); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsetuple();
      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();
        if (s3 !== peg$FAILED) {
          s4 = peg$parsefunc();
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c14(s2, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsefunc() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c15) {
      s1 = peg$c15;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c16); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = peg$currPos;
      peg$silentFails++;
      if (input.substr(peg$currPos, 2) === peg$c17) {
        s5 = peg$c17;
        peg$currPos += 2;
      } else {
        s5 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      peg$silentFails--;
      if (s5 === peg$FAILED) {
        s4 = void 0;
      } else {
        peg$currPos = s4;
        s4 = peg$FAILED;
      }
      if (s4 !== peg$FAILED) {
        if (input.length > peg$currPos) {
          s5 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c19); }
        }
        if (s5 !== peg$FAILED) {
          s4 = [s4, s5];
          s3 = s4;
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = peg$currPos;
        peg$silentFails++;
        if (input.substr(peg$currPos, 2) === peg$c17) {
          s5 = peg$c17;
          peg$currPos += 2;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c18); }
        }
        peg$silentFails--;
        if (s5 === peg$FAILED) {
          s4 = void 0;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        if (s4 !== peg$FAILED) {
          if (input.length > peg$currPos) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c19); }
          }
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c17) {
          s3 = peg$c17;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c18); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c20(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsetuple() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 40) {
      s1 = peg$c21;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c22); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseterms();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 41) {
              s5 = peg$c23;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c24); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c25(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c26) {
        s1 = peg$c26;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c27); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c28();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseterms() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseterm();
    if (s1 !== peg$FAILED) {
      s2 = peg$parsewsp();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseterms();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c29(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseterm();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c30(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseterm() {
    var s0;

    s0 = peg$parsetuple();
    if (s0 === peg$FAILED) {
      s0 = peg$parsevarname();
      if (s0 === peg$FAILED) {
        s0 = peg$parseconstant();
        if (s0 === peg$FAILED) {
          s0 = peg$parsenot();
        }
      }
    }

    return s0;
  }

  function peg$parsenot() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 94) {
      s1 = peg$c31;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c32); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsetuple();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c33(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsevarname() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 39) {
      s1 = peg$c34;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c35); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c36.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c37); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c36.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c37); }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c38(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseconstant() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$currPos;
    peg$silentFails++;
    if (input.substr(peg$currPos, 2) === peg$c39) {
      s2 = peg$c39;
      peg$currPos += 2;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c40); }
    }
    peg$silentFails--;
    if (s2 === peg$FAILED) {
      s1 = void 0;
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c41.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c42); }
      }
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$c41.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c42); }
          }
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c43(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsecomment() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c39) {
      s1 = peg$c39;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c40); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = peg$currPos;
      peg$silentFails++;
      if (input.substr(peg$currPos, 2) === peg$c44) {
        s5 = peg$c44;
        peg$currPos += 2;
      } else {
        s5 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c45); }
      }
      peg$silentFails--;
      if (s5 === peg$FAILED) {
        s4 = void 0;
      } else {
        peg$currPos = s4;
        s4 = peg$FAILED;
      }
      if (s4 !== peg$FAILED) {
        if (input.length > peg$currPos) {
          s5 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c19); }
        }
        if (s5 !== peg$FAILED) {
          s4 = [s4, s5];
          s3 = s4;
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = peg$currPos;
        peg$silentFails++;
        if (input.substr(peg$currPos, 2) === peg$c44) {
          s5 = peg$c44;
          peg$currPos += 2;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c45); }
        }
        peg$silentFails--;
        if (s5 === peg$FAILED) {
          s4 = void 0;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        if (s4 !== peg$FAILED) {
          if (input.length > peg$currPos) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c19); }
          }
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c44) {
          s3 = peg$c44;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c45); }
        }
        if (s3 !== peg$FAILED) {
          s1 = [s1, s2, s3];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 35) {
        s1 = peg$c46;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c47); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        if (peg$c48.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c49); }
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$c48.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c49); }
          }
        }
        if (s2 !== peg$FAILED) {
          if (peg$c50.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c51); }
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parsewsp() {
    var s0, s1;

    s0 = [];
    if (peg$c52.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c53); }
    }
    if (s1 === peg$FAILED) {
      s1 = peg$parsecomment();
    }
    if (s1 !== peg$FAILED) {
      while (s1 !== peg$FAILED) {
        s0.push(s1);
        if (peg$c52.test(input.charAt(peg$currPos))) {
          s1 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c53); }
        }
        if (s1 === peg$FAILED) {
          s1 = peg$parsecomment();
        }
      }
    } else {
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parse_() {
    var s0, s1;

    peg$silentFails++;
    s0 = [];
    if (peg$c52.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c53); }
    }
    if (s1 === peg$FAILED) {
      s1 = peg$parsecomment();
    }
    while (s1 !== peg$FAILED) {
      s0.push(s1);
      if (peg$c52.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c53); }
      }
      if (s1 === peg$FAILED) {
        s1 = peg$parsecomment();
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c54); }
    }

    return s0;
  }

  peg$result = peg$startRuleFunction();

  if (peg$result !== peg$FAILED && peg$currPos === input.length) {
    return peg$result;
  } else {
    if (peg$result !== peg$FAILED && peg$currPos < input.length) {
      peg$fail(peg$endExpectation());
    }

    throw peg$buildStructuredError(
      peg$maxFailExpected,
      peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
      peg$maxFailPos < input.length
        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
    );
  }
}

module.exports = {
  SyntaxError: peg$SyntaxError,
  parse:       peg$parse
};

},{}],27:[function(require,module,exports){
const Ids = require("./ids");
// const profile = require("../utils/profile");

class Branches {
    
    constructor (events) {
        this.ids = new Ids();
        
        this.branches = {};
        this.events = events;
        this.root = this.getId({
            action: "init",
            level: 0
        }).branchId;
        
        // events.trigger('branch', {brancId: this.root});
    }
    
    getId (obj) {
        if (obj.level === undefined) {
            if (obj.parent) {
                const parent = this.getRawBranch(obj.parent);
                obj.level = parent.data.level + 1;
            }
            else {
                obj.level = 0;
            }
        }
        
        Object.freeze(obj);
        const branchId = this.ids.id(obj);
        var exists = true;

        if (!this.branches[branchId]) {
            exists = false;
            this.branches[branchId] = {
    	        data: obj,
    	        metadata: {
    	        	changes: {},
    	        	counter: 0
    	        }
    	    };

            if (obj.parent !== undefined) {
                var parents;
                
                if (obj.parent instanceof Array) {
                    parents = obj.parent;
                }
                else {
                    parents = [obj.parent];
                }
                
                parents.forEach(parentBranchId => {
                    const branch = this.getRawBranch(parentBranchId);
                   
                    branch.metadata.status = branch.metadata.status || {};
                   
                    if (!branch.metadata.status.closed) {
                       branch.metadata.status.closed = true;
                       Object.freeze(branch.metadata.changes);
                       
                       this.events.trigger("branch", {branchId: parentBranchId});
                    }
                });
            }
        }
        
        return {branchId, exists};
    }
    
    getRawBranch (id) {
	    return this.branches[id];
    }

    getBranch (id) {
	    var branch = this.getRawBranch(id);
	    return branch?branch.data:undefined;
    }
    
    
    getDataId (branchId, id) {
        if (id === undefined) {
            return;
        }

    	var c, b;
    	var bh = branchId;
    	
    	do {
    		id = c || id;
    		b = this.getRawBranch(bh);
    		c = b.metadata.changes[id];
    		
    		if (c === undefined) {
    			if (typeof b.data.parent === 'number') {
    				bh = b.data.parent;
    			}
    			else {
    				c = id;
    			}
    		}
    		else {
    			bh = branchId;
    		}
    	} while (c !== id);
    	
    	return c;
    }

    transform (branchId, oldId, newId) {
    	oldId = this.getDataId(branchId, oldId);
    	newId = this.getDataId(branchId, newId);
    	if (oldId !== newId) {
    		this.getRawBranch(branchId).metadata.changes[oldId] = newId;
    	}
    }
    
    getLevel (id) {
        return this.getBranch(id).level;
    }

    end ({rootBranchId, branchId, success, fail, reason}) {
        var branch = this.getRawBranch(branchId);
        
        branch.metadata.status = branch.metadata.status || {};
        
        branch.metadata.status.end = true;
        branch.metadata.status.fail = fail;
        branch.metadata.status.success = success;
        branch.metadata.status.reason = reason;
        
        if (!branch.metadata.status.closed) {
            branch.metadata.status.closed = true;
            
            Object.freeze(branch.metadata.changes);
            
            this.events.trigger("branch", {branchId});
        }

    	this.events.trigger("branch-end", {branchId, success, fail, reason});
    	
    	if (rootBranchId && success) {
    	    const branch = this.getRawBranch(rootBranchId);
    	    branch.metadata.results = branch.metadata.results || [];
    	    
    	    if (branch.metadata.results.indexOf(branchId) === -1) {
    	        branch.metadata.results.push(branchId);
    	    }
    	}
    }

    getUniqueId (id) {
        return id + "$" + this.getRawBranch(id).metadata.counter++;
    }
}

// profile.profileClass(Branches);

module.exports = Branches;

},{"./ids":29}],28:[function(require,module,exports){
(function (global){
const Ids = require("./ids");

class Data {
    
    constructor (events) {
        this.ids = new Ids();
        
        this.data = {};
        this.globals = {};
        this.events = events;
    }
    
    getId (obj) {
        Object.freeze(obj);
        
        const id = this.ids.id(obj);
        
        if (!this.data[id]) {
            this.data[id] = {
    	        data: obj
    	    };
        }
        
        return id;
    }
    
    add (obj) {
        var r = obj;
    	var self = this;
    	
    	if (obj instanceof Array) {
    		r = obj.map(
    			function (o) {
    				return self.add(o);	
    			}
    		);
    		
    		r = this.getId(r);
    	}
    	else if (typeof obj === 'object') {
    		r = {};
    		for (var i in obj) {
    			r[i] = this.add(obj[i]);
    		}
    			
    		r = this.getId(r);
    	}
    	else {
    		r = this.getId(r);
    	}
    	
    	return r;
    }
    
    get (id) {
	    return this.data[id];
    }
    
    global (name) {
    	var globalHash = this.globals[name];
    
    	if (!globalHash) {
    		globalHash = this.add({global: name});
    		this.globals[name] = globalHash;
    	}
    
    	return globalHash;
    }
}

module.exports = Data;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./ids":29}],29:[function(require,module,exports){
class Ids {
    
    constructor () {
        this.table = {};
        this.ids = 1;
    }
    
    id (obj) {
        const key = JSON.stringify(obj);
        var id = this.table[key];
        
        if (id === undefined) {
            this.table[key] = id = this.ids;
            this.ids++;
        }
        
        return id;
    }
    
    hasId (id) {
        return this.table[id] !== undefined;
    }
    
    
    getId (obj) {
        const key = JSON.stringify(obj);
        return this.table[key];
    }
}

module.exports = Ids;


},{}],30:[function(require,module,exports){
const Data = require("./data");
const Branches = require("./branches");
const Events = require("../events");

function getTopCode (code, changes) {
	while(changes[code]) {
		code = changes[code];
	}
	
	return code;
}

class ZVS {
	constructor (events) {
		this.version = {
			major: 1,
			minor: 0,
			patch: 0
		};

		this.events = events || new Events();
		this.data = new Data(this.events);
		this.branches = new Branches(this.events);
		this.actions = {};
		this.definitionsMatch = {};
	}
	
	getRawData (branchId, dataId) {
		return this.data.get(this.branches.getDataId(branchId, dataId));
	}

	getData (branchId, dataId) {
		var data = this.getRawData(branchId, dataId);
		return data?data.data:undefined;
	}

	update (branchId, id, obj) {
		var o = this.getData(branchId, id);
	
		var clone = Object.assign({}, o);
	
		for (var i in obj) {
			var a = this.data.add(obj[i]);
			clone[i] = a; 
		}
		
		this.branches.transform(branchId, id, this.data.getId(clone));
	}

	getObject (branchId, dataId) {
		branchId = branchId || this.branches.root;
	
		var obj = this.getData(branchId, dataId);
		var r;
		var self = this;
		
		if (obj instanceof Array) {
			r = obj.map(
				function (o) {
					return self.getObject(branchId, o);	
				}
			);
		}
		else if (typeof obj === 'object') {
			r = {};
			for (var i in obj) {
				r[i] = this.getObject(branchId, obj[i]);
			}
		}
		else {
			r = obj;
		}

		return r;
	}
	
	/*
		This will get all updated ids of the given dataId and record it 
		on branch changes.
	*/
	getUpdatedId (branchId, dataId, stack) {
		
		stack = stack || [];
		if (stack.indexOf(dataId) !== -1) {
			// throw "Invalid data found " + dataId + ", is cyclic!!";
			// Data definition is cyclic and therefor does not exists.
			console.log("Cyclic data found " + dataId);
			return;
		}

		stack.push(dataId);

		dataId = this.branches.getDataId(branchId, dataId);
		
		var t = this.data.get(dataId).data;
		var dirty = false;
		
		if (t instanceof Array) {
			// clone array,
			t = t.slice(0);

			for (var i=0; i<t.length; i++) {
				const id = this.getUpdatedId(branchId, t[i], stack.slice(0));
				
				if (id === undefined) {
					return;
				}

				if (t[i] !== id) {
					dirty = true;
				}
				
				t[i] = id;
			}
		}
		else if (typeof t === 'object') {
			// clone object,
			t = Object.assign({}, t);
			for (var i in t) {
				const id = this.getUpdatedId(branchId, t[i], stack.slice(0));

				if (id === undefined) {
					return;
				}
				
				if (t[i] !== id) {
					dirty = true;
				}
				
				t[i] = id;
			}
		}
		
		if (dirty) {
			const id = this.data.getId(t);
			this.branches.transform(branchId, dataId, id);
			dataId = id;
		}
		
		return dataId;
	}

	getChangesCodes (branchsHashs) {
		var codes = {};
		branchsHashs = branchsHashs.slice(0);
	
		for (var i=0; i<branchsHashs.length; i++) {
			var branchHash = branchsHashs[i];
			var branch = this.branches.getRawBranch(branchHash);
			
			if (branch.metadata.changes) {
				Object.assign(codes, branch.metadata.changes);
			}
			
			if (
				typeof branch.data.parent === 'number' &&
				branchsHashs.indexOf(branch.data.parent) === -1
			) {
				branchsHashs.push(branch.data.parent);
			}
		}
		
		for (var i in codes) {
			codes[i] = [];
		}
		
		return codes;
	}

	merge (branchsHashs, conflictHandler, action) {
		if (branchsHashs.length <= 1) {
			return branchsHashs;
		}
		
		var changes = this.getChangesCodes(branchsHashs);
		var cs;
		var newCode;
		
		for (var code in changes) {
			code = +code;
			for (var i=0; i<branchsHashs.length; i++) {
				newCode = this.branches.getDataId(branchsHashs[i], code);
				cs = changes[code];
	
				if (
					newCode !== code &&
					cs.indexOf(newCode) === -1
				) {
					cs.push(newCode);
				}
			}
		}
		
		var conflicts = {};
		
		for (var code in changes) {
			code = +code;
			cs = changes[code];
	
			changes[code] = cs[0];
	
			if (cs.length > 1) {
				conflicts[code] = cs;
			}
		}
		
		// remove defers,
		// defers will never occur on conflits,
		for (var code in changes) {
			code = +code;
			changes[code] = getTopCode(code, changes);
		}
		
		// remove codes that don't change,
		for (var code in changes) {
			code = +code;
			if (changes[code] === code) {
				delete changes[code];
			}
		}
	
		const level = this.branches.getLevel(branchsHashs[0]) + 1;
		
		var bHash = this.branches.getId({
			parent: branchsHashs,
			args: branchsHashs.slice(0),
			action: action || "_merge",
			level: level
		}).branchId;
		
		var rawBranch = this.branches.getRawBranch(bHash);
	
		rawBranch.metadata.changes = changes;
	
		var branchs = [];
		
		for (var code in conflicts) {
			code = +code;
			cs = conflicts[code];
			var b = conflictHandler(this, {branchId: bHash, args: cs});
			
			if (!b) {
				return;
			}
			
			branchs.push(b);
		}
	
		if (branchs.length === 0) {
			return [bHash];
		}
		
		return this.merge(branchs, conflictHandler);
	}
	
	// TODO: we need to get a better definitions/version system,
	// TODO: we need to start making zvs very specific to zebrajs.
	addDefinitionsMatch (definitionsBranchId, match) {
		this.definitionsMatch[definitionsBranchId] = match;
	}
}

module.exports = ZVS;

},{"../events":1,"./branches":27,"./data":28}],31:[function(require,module,exports){
const Z = require("zebrajs");
const utils = require("zebrajs/lib/utils");
const files = {};

const sent = {};
const send = [];
var timeout;
var lastSent = Infinity;
var dups = 0;

function readFile(fileId) {
    return new Promise(function (resolve, reject) {
        const f = files[fileId] = files[fileId] || {
            listenners: []
        };

        if (f.data) {
            resolve(f.data);
        } else {
            f.listenners.push({ resolve, reject });
            postMessage({ action: 'readfile', data: fileId });
        }
    });
}

const z = new Z({
    readFile,
    settings: {
        // depth: 5
    }
});

function getQuery(branch) {
    const queryId = z.zvs.data.global("query");
    const queryParent = z.zvs.getObject(branch.data.parent, queryId);
    const query = z.zvs.getObject(branch.metadata.id, queryId);

    const queryOriginal = utils.toString(queryParent.type ? queryParent : query, true);
    const queryResult = queryParent.type ? utils.toString(query, true) : undefined;

    var r = `
        <br>
        Query (Original):<br>
        <div class='box'>
        ${queryOriginal}
        </div>`;

    if (queryResult) {
        r += `
            <br>
            Query (Result):<br>
            <div class='box'>
            ${utils.toString(z.zvs.getObject(branch.metadata.id, queryId), true)}
            </div>`;
    }

    return r + "<br>";
}

function getInfo(branch) {
    var result = '';

    switch (branch.data.action) {
        case 'init':
            result = '';
            break;

        case 'definitions':
            result = `
            <br>
            Definitions:<br>
            ${z.zvs.getObject(branch.data.parent, branch.data.args[0]).map(d => "<div class='box'>" + utils.toString(d) + "</div>").join("<br>")}
            `;
            break;

        case 'query':
            result = getQuery(branch);
            break;

        case 'unify':
            result = `
                <br>
                <div class='box'>
                p: ${utils.toString(z.zvs.getObject(branch.data.parent, branch.data.args[0]), true)}
                </div>
                <div class='box'>
                q: ${utils.toString(z.zvs.getObject(branch.data.parent, branch.data.args[1]), true)}
                </div>
                <br>
                ${getQuery(branch)}
            `;
            break;
    }

    return result + `<br>JSON: <div class='box'>${JSON.stringify(branch, null, '\t').replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;").replace(/\n/g, "<br>")}</div><br>`;
}

z.events.on('branch', function ({ branchId }) {
    if (!sent[branchId]) {
        sent[branchId] = true;

        const branch = z.zvs.branches.getRawBranch(branchId);

        // TODO: set the id on lib
        branch.metadata.id = branchId;

        branch.metadata.prettyHTML = `
            Branch Id: ${branchId}<br>
            Action: ${branch.data.action}<br>
            Args Count: ${branch.data.args ? branch.data.args.length : "<no args>"}<br>
            Parent: ${JSON.stringify(branch.data.parent)}<br>
            ${getInfo(branch)}<br>
        `;

        send.push(branch);

        /*if (branch.data.parent === undefined) {
            // if root just send it ...
            console.log("Send root branch!!");
            postMessage({
                action: 'branches',
                data: send.splice(0, send.length)
            });
        }
        else {*/

        if (send.length > 200 || lastSent - new Date().getTime() > 2000) {
            clearTimeout(timeout);
            console.log("Send " + send.length + " branches!! Dups: " + dups);

            postMessage({
                action: 'branches',
                data: send.splice(0, send.length)
            });

            lastSent = new Date().getTime();
        } else {
            clearTimeout(timeout);
            timeout = setTimeout(function () {
                console.log("Send " + send.length + " branches!! Dups: " + dups);
                lastSent = new Date().getTime();
                postMessage({
                    action: 'branches',
                    data: send.splice(0, send.length)
                });
            }, 1000);
        }
        // }
    } else {
        dups++;
        // TODO: check why there is so many repeated branches to be sent ??
        // console.log("Branch id " + branchId + " is alredy sent or to be send!!");
    }
});

function file(data) {
    files[data.fileId].data = data.data;
    files[data.fileId].listenners.forEach(function (c) {
        c.resolve(data.data);
    });

    delete files[data.fileId].listenners;
}

function add(data) {
    z.events.trigger('branch', { branchId: z.zvs.branches.root });
    z.add({ value: data });
}

process = {
    'readfile': file,
    'add': add
};

onmessage = function ({ data: { action, data } }) {
    const c = process[action];

    if (c) {
        c(data);
    }
};

},{"zebrajs":25,"zebrajs/lib/utils":24}]},{},[31]);
