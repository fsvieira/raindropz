const sessions = {};
const filesystem = require("../filesystem");
const Events = require("zebrajs/lib/events");

class Session {
    constructor() {
        const zworker = new Worker('./js/zworker.js');
        const self = this;

        zworker.onmessage = function ({data: {action, data}}) {
            switch (action) {
                case 'readfile':
                    self.readFile(data);
                    break;

                case 'branches':
                    data.forEach(branch => self.branch(branch));
                    
                    break;
            }
        };
        
        const tree = {
            data: {},
            stats: {
                maxLevel: 0
            },
            childs: {}
        };
        
        this.tree = tree;
        
        this.zworker = zworker;
        this.events = new Events();
    }
    
    add (fileId) {
        this.zworker.postMessage({
            action: 'add',
            data: "[" + fileId + "]"
        });
    }
    
    readFile (fileId) {
        const zworker = this.zworker;
        filesystem.open(fileId).then(
            function (data) {
                zworker.postMessage({
                    action: 'readfile',
                    data: {
                        fileId,
                        data
                    }
                });
            }
        );
    }
    
    branch (branch) {
        const branchId = branch.metadata.id;
        
        if (!this.tree[branchId]) {
            this.tree.data[branchId] = branch;
            this.tree.stats.maxLevel = this.tree.stats.maxLevel<branch.data.level?branch.data.level:this.tree.stats.maxLevel;
            branch.metadata.id = branchId;
            
            if (branch.data.parent) {
                if (branch.data.parent instanceof Array) {
                    branch.data.parent.forEach((parentId) => {
                        this.tree.childs[parentId] = this.tree.childs[parentId] || [];
                        this.tree.childs[parentId].push(branch);
                    });
                }
                else {
                    const parentId = branch.data.parent;
                    this.tree.childs[parentId] = this.tree.childs[parentId] || [];
                    this.tree.childs[parentId].push(branch);
                }
            }
            else {
                this.tree.root = branchId;
            }

            this.events.trigger('update', this.tree);
        }
        else {
            console.log("DUPLICATED ID: " + branchId);
        }
    }
}

function getSession (id) {
    var session = sessions[id];
    
    if (!session) {
        sessions[id] = session = new Session(id);
    }
    
    return session;
}

module.exports = getSession;

