const Z = require("zebrajs");
const utils = require("zebrajs/lib/utils");
const files = {};

function readFile (fileId) {
    return new Promise(function (resolve, reject) {
        const f = files[fileId] = files[fileId] || {
            listenners: []
        };
        
        if (f.data) {
            resolve(f.data);
        }
        else {
            f.listenners.push({resolve, reject});
            postMessage({action: 'readfile', data: fileId});
        }
    });
}

const z = new Z({
    readFile,
    settings: {
        depth: 10
    }
});

function getQuery (branch) {
    const queryId = z.zvs.data.global("query");
    const queryParent = z.zvs.getObject(branch.data.parent, queryId);
    const query = z.zvs.getObject(branch.metadata.id, queryId);

    const queryOriginal = utils.toString(queryParent.type?queryParent:query, true);
    const queryResult = queryParent.type?utils.toString(query, true):undefined;
            
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

function getInfo (branch) {
    switch (branch.data.action) {
        case 'init':
            return '';
        
        case 'definitions':
            return `
            <br>
            Definitions:<br>
            ${
                z.zvs.getObject(branch.data.parent, branch.data.args[0]).map(
                    d => "<div class='box'>" + utils.toString(d) + "</div>"
                ).join("<br>")
            }
            `;

        case 'query':
            return getQuery(branch);
            
        case 'unify':
            return `
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
    }
    
    return '';
}


const sent = {};
const send = [];
var timeout;
var lastSent = Infinity;
var dups = 0;

z.events.on('branch', function ({branchId}) {
    if (!sent[branchId]) {
        sent[branchId] = true;

        const branch = z.zvs.branches.getRawBranch(branchId);
        
        // TODO: set the id on lib
        branch.metadata.id = branchId;
        
        branch.metadata.prettyHTML = `
            Branch Id: ${branchId}<br>
            Action: ${branch.data.action}<br>
            Args Count: ${branch.data.args?branch.data.args.length:"<no args>"}<br>
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
            }
            else {
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
    }
    else {
        dups++;
        // TODO: check why there is so many repeated branches to be sent ??
        // console.log("Branch id " + branchId + " is alredy sent or to be send!!");
    }
});

function file (data) {
    files[data.fileId].data = data.data;
    files[data.fileId].listenners.forEach(function (c) {
        c.resolve(data.data);
    });
    
    delete files[data.fileId].listenners;
}

function add (data) {
    z.events.trigger('branch', {branchId: z.zvs.branches.root});
    z.add({value: data});
}

process = {
    'readfile': file,
    'add': add
};

onmessage = function ({data: {action, data}}) {
    const c = process[action];
    
    if (c) {
        c(data);
    }
};

