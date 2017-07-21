var Z = require("zebrajs");
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
        depth: 5
    }
});


z.events.on('branch', function ({branchId}) {
    // TODO: send more info.
    const branch = z.zvs.branches.getRawBranch(branchId);
    branch.metadata.prettyHTML = `
        Branch Id: ${branchId}<br>
        Action: ${branch.data.action}<br>
        Parent: ${JSON.stringify(branch.data.parent)}
    `;

    postMessage({
        action: 'branch',
        data: {
            branchId,
            branch
        }
    });
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
    console.log(data);
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

