var filesystem = require("./filesystem");
var ZSession = require("zebrajs");
var Events = require("zebrajs/lib/events");
var utils = require("zebrajs/lib/utils");

/*
    TODO:
        We may want to share zsession with other controllers, thats why this should be a service,
        but we would need some way to manage this:
            - be able to perform operations like run, pause, stop, continue, restart, update.
            - be able to notify all listenner of changes.
*/

class Session {
    
    constructor (id) {
        this.id = id;
        const events = new Events();
        this.events = events;

        const session = new ZSession({
            readFile: function (filename) {
                return filesystem.open(id).then(function (data) {
                    console.log("DATA: " + JSON.stringify(data));
                    return data;
                });
            },
            settings: {
                depth: 4
            }
        });

        this.session = session;
        this.data = {};
        
        const tree = {
            data: {},
            updates: [],
            stats: {
                maxLevel: 0,
                maxLevelNodes: 0
            },
            levels: {}
        };
        
        this.tree = tree;
        
        function mkTree ({branchId}) {
            var bId = branchId;
            tree.updates = [];

            const branch = session.zvs.branches.getRawBranch(bId);
            tree.data[bId] = branch;
            tree.updates.push(bId);
            tree.stats.maxLevel = tree.stats.maxLevel<branch.data.level?branch.data.level:tree.stats.maxLevel;
                
            const l = tree.levels[branch.data.level] = tree.levels[branch.data.level] || [];
                
            if (l.indexOf(bId) === -1) {
                // TODO: order levels by parent,
                l.push(bId);
            }

            tree.stats.maxLevelNodes = tree.stats.maxLevelNodes<l.length?l.length:tree.stats.maxLevelNodes; 

            if (tree.updates.length) {
                events.trigger('update', tree);
            }
        }

        mkTree({branchId: session.zvs.branches.root});        
        this.session.events.on('branch', mkTree);

        // TODO: session is killing event loop, we need to make lib to run on worker.
        session.add({value: "[" + id + "]"});
    }

    /*
        TODO:
            - reconstruct the tree,
            - save the number of iterations,
            - mark tree last updates,
            - send tree and updates on "update" event.
    */
}

const sessions = {};

function getSession (id) {
    var session = sessions[id];
    
    if (!session) {
        sessions[id] = session = new Session(id);
    }
    
    return session;
}

module.exports = getSession;

