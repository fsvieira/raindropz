/*
    Store and load files:
    * Local storage,
*/

var config = require('../config');

var types = {
    DIRECTORY: 0,
    FILE: 1
};

var cache = {};

var localStorageFileTable = config.localstoragePrefix + "filetable";
var localStorageFile = config.localstoragePrefix + "file$";

function saveFileTable () {
    localStorage.setItem(localStorageFileTable, JSON.stringify(cache.filetable));
}

function saveFile (id, data) {
    return new Promise(function (resolve, reject) {
        localStorage.setItem(localStorageFile + id, data);
        resolve(id);
    });
}

function removeRecursive (filetable, id) {
    var record = filetable.records[id];
    delete filetable.records[id];
    
    if (record.type === types.DIRECTORY) {
        for (var i=0; i<record.childs.length; i++) {
            removeRecursive(filetable, record.childs[i]);
        }
    }
    else {
        // remove file,
        localStorage.removeItem(localStorageFile + id);
    }
}

function remove (id) {
    return getFileTable().then(function (filetable) {
        var record = filetable.records[id];
        var childs = filetable.records[record.parentID].childs;
        
        childs.splice(childs.indexOf(id), 1);
        
        removeRecursive(filetable, id);
        saveFileTable();
        
        return record.parentID;
    });
}

function getFileTable () {
    return new Promise(function (resolve, reject) {
        if (cache.filetable) {
            resolve(cache.filetable);
        }
        else {
            var ft = localStorage.getItem(localStorageFileTable);
            if (ft) {
                cache.filetable = JSON.parse(ft);
            }
            else {
                
                cache.filetable = {
                    idCounter: 1,
                    root: 0,
                    records: {
                        "0" : {
                            name: "root",
                            type: types.DIRECTORY,
                            childs: [],
                            id: 0
                        }
                    }
                };
            }
            
            resolve(cache.filetable);
        }
    });
}

function create (name, options) {
    return getFileTable().then(function (filetable, root) {
        var parent = options.parent || filetable.records[options.parentID] || filetable.records[filetable.root];
        var id, r;

        for (var i=0; i<parent.childs.length; i++) {
            if (filetable.records[parent.childs[i]].name === name) {
                id = i; 
                break;
            }
        }

        if (id !== undefined) {
            if (options.silent) {
                return id;
            }
            else {
                return Promise.reject("NAME_CONFLICT");
            }
        }

        id = filetable.idCounter++;
        
        filetable.records[id] = r = {
            id: id,
            name: name,
            type: options.type,
            parentID: parent.id
        };
        
        if (options.type === types.DIRECTORY) {
            r.childs = [];
        }

        return saveFile(id, options.data || "").then(function () {
            parent.childs.push(id);
            saveFileTable();
            return id;
        });
    });
}

function open (id) {
    return new Promise(function (resolve, reject) {
        resolve(localStorage.getItem(localStorageFile + id));
    });
}

// Return a copy of objects,
function ls (id) {
    return getFileTable().then(function (filetable) {
        var list = [];
        var r;
        if (id === undefined) {
            r = Object.assign(
                {}, 
                filetable.records[filetable.root]
            );
            
            delete r.childs;
            
            list.push(r);
        }
        else {
            parent = filetable.records[id];

            for (var i=0; i<parent.childs.length; i++) {
                r = Object.assign(
                    {},
                    filetable.records[parent.childs[i]]
                );

                delete r.childs;

                list.push(r);
            }
        }
        
        list.sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
        
        return list;
    });
}


function attributes (id) {
    return getFileTable().then(function (filetable) {
        return Object.assign({}, filetable.records[id]);
    });
}

// todo events
module.exports = {
    create: create,
    open: open,
    ls: ls,
    types: types,
    write: saveFile,
    attributes: attributes,
    remove: remove
};

