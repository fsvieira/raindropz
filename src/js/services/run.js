var filesystem = require("./filesystem");
var Z = require("zebrajs/lib3/z");
var utils = require("zebrajs/lib3/utils");

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
    var globalsHash = zvs.add({
        type: "globals"
    });
    
    var q = zvs.getObject(globalsHash, branch).query;

    if (q) {
        q = utils.toString(q, true);
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
            var globals1 = injectLinesString('\t', utils.toString(zvs.getObject(b.data.args[1], b.data.parent).definitions, true));
            var globals2 = injectLinesString('\t', utils.toString(zvs.getObject(b.metadata.changes[b.data.args[1]], branch).definitions, true));
            
            b.metadata.prettyText = 'Definitions: \n'
                + definitions + '\n\n'
                + 'Global Definitions: \n' + globals1 + '\n => \n' + globals2 + ';\n'
            ;
            break;

        case 'query':
            var query = injectLinesString('\t', utils.toString(zvs.getObject(b.data.args[0], b.data.parent), true)) + ' : Query';
            var globals = injectLinesString('\t', utils.toString(zvs.getObject(b.data.args[1], b.data.parent).definitions, true)) + ' : Definitions';
            
            b.metadata.prettyText = b.data.action + '(\n' + query + ',\n'+ globals + '\n)\n => \n' + printQuery(zvs, branch);
            
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
        
        case 'queryNegation':
            /*
            p = injectLinesString('\t', utils.toString(zvs.getObject(b.data.args[0], b.data.parent), true));
            b.metadata.prettyText = b.data.action + '(\n' + p + '\n)\n => \n' + printQuery(zvs, branch);
            break;
            */
            /*console.log(JSON.stringify(b, null, '\t'));
            console.log(utils.toString(zvs.getObject(b.data.args[0], branch), true));*/
        default:
            b.metadata.prettyText = b.data.action;
    }
}

function text2html (text) {
    return text.replace(/\n/g, '<br>').replace(/\t/g, '<div class="space-tab"></div>');
}

function run (id) {
    // get data from file.
    return filesystem.open(id).then(function (data) {
        return filesystem.attributes(id).then(function (attr) {
            attr.data = data;
            
            var z = new Z();
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
    });
}



module.exports = {
    run: run
};
