var filesystem = require("./filesystem");
var Session = require("zebrajs");
var utils = require("zebrajs/lib/utils");

function injectLinesString (iStr, str) {
    if (str === '') {
        return iStr + '\\empty';
    }
    else {
        return str.trim().split('\n').map(function (s) {
            return iStr + s;
        }).join('\n');
    }
}

function printQuery (zvs, branch) {
    // Get globals
    var query = zvs.global("query");
    var q = zvs.getObject(query, branch);
    
    if (q) {
        q = utils.toString(q, true) + "::" + branch + "("+ query +")";
    }
    
    return q;
}

function setupMetadata (zvs, branch, b) {
    b = b || zvs.objects.branchs[branch];
    var p, q;

    switch (b.data.action) {
        case 'init':
            b.metadata.prettyText = 'init;';
            break;
        
        case 'definitions':
            var definitions = injectLinesString('\t', utils.toString(zvs.getObject(b.data.args[0], b.data.parent), true));
            var globals1 = injectLinesString('\t', utils.toString(zvs.getObject(zvs.global("definitions"), b.data.parent).definitions, true));
            var globals2 = injectLinesString('\t', utils.toString(zvs.getObject(zvs.global("definitions"), branch).definitions, true));
            
            b.metadata.prettyText = 'Definitions: \n'
                + definitions + '\n\n'
                + 'Global Definitions: \n' + globals1 + '\n => \n' + globals2 + ';\n'
            ;
            
            break;

        case 'query':
            b.metadata.prettyText = 'Query:\n\t' + printQuery(zvs, b.data.parent) + "\n=>\n\t" + printQuery(zvs, branch);
            
            break;
            
        case 'unify':
            p = injectLinesString('\t', utils.toString(zvs.getObject(b.data.args[0], b.data.parent), true));
            q = injectLinesString('\t', utils.toString(zvs.getObject(b.data.args[1], b.data.parent), true));
            
            b.metadata.prettyText = b.data.action + '(\n' + p + ',\n'+ q + '\n)\n => \n' + printQuery(zvs, branch);
            
            break;
        
        case '_merge':
            var bQueries = '';
            for (var i=0; i<b.data.parent.length; i++) {
                bQueries += printQuery(zvs, b.data.parent[i]) + '\n';
            }
            
            bQueries = injectLinesString('\t', bQueries);
            
            b.metadata.prettyText = b.data.action +'(\n' + bQueries +  '\n)\n => \n' + printQuery(zvs, branch);
            break; 
        
        case 'mergeConflictHandler':
            p = injectLinesString('\t', utils.toString(zvs.getObject(b.data.args[0], b.data.parent), true));
            q = injectLinesString('\t', utils.toString(zvs.getObject(b.data.args[1], b.data.parent), true));
            
            b.metadata.prettyText = b.data.action + '(\n' + p + ',\n'+ q + '\n)\n => \n' + printQuery(zvs, branch);
            
            break;
            
        case 'negations':
            p = injectLinesString('\t', utils.toString(zvs.getObject(b.data.args[0], b.data.parent), true));
            b.metadata.prettyText = b.data.action + '(\n' + p + '\n)\n => \n' + printQuery(zvs, branch);
            break;
            
        default:
            b.metadata.prettyText = b.data.action;
    }
  
    b.metadata.prettyText += 
        "\n\n== Branch ID ==\n" + branch +
        "\n\n== Branch Info ==\n" + JSON.stringify(b.data, null, '\t') +
        "\n\n== Branch Notes ==\n" + JSON.stringify(b.metadata.notes, null, '\t')
    ;
}

function text2html (text) {
    return text.replace(/\n/g, '<br>').replace(/\t/g, '<div class="space-tab"></div>');
}

function run (id) {
    // get data from file.
    const session = new Session({
        readFile: function (filename) {
            return filesystem.open(id).then(function (data) {
                console.log(JSON.stringify(data));
                return data;
            });
        },
        settings: {
            depth: 20
        }
    });
    
    session.events.on('query-start', function (queryBranchId) {
        console.log(queryBranchId);
    });
    
    return new Promise(function (resolve, reject) {
        session.events.on('halt', function () {
            console.log("halt");
            filesystem.attributes(id).then(function (attr) {
                console.log(JSON.stringify(attr));
                resolve({
                    run: session.zvs,
                    file: attr
                });
            });
        });
        
        session.add({value: '[' + id + ']'});
    });
    
    /*
    return filesystem.open(id).then(function (data) {
        return filesystem.attributes(id).then(function (attr) {
            attr.data = data;
            
            var z = new Z(20); // Limit run max deep Z(20)
            z.add(data);

            for (var branch in z.zvs.objects.branchs) {
                var b = z.zvs.objects.branchs[branch];
                setupMetadata(z.zvs, branch, b);
                
                b.metadata.prettyHTML = text2html(b.metadata.prettyText); 
            }
            
            return {
                file: attr,
                run: z.zvs.objects
            };
        });
    });*/
}



module.exports = {
    run: run
};
