var templates = require("../services/templates");
var d3 = require("d3");

function Run (data, el) {
    this.name = data.file.name;
    this.icon = "typcn typcn-media-play";
    this.id = data.file.id;

    this.data = data;
    
    data.prettyPrint = JSON.stringify(data.run, null, '\t');

    this.init(el);
}


function setLevels (data, branch, level) {
    var order = 0;
    
    data.levels = {};
    
    var maxLevel = 0;
    
    function _setLevels (data, branch, level) {
        data.levels[level] = data.levels[level] || [];
        data.levels[level].push(branch);
        
        var b = data.branchs[branch];
        b.metadata.level = level;
        b.metadata.order = order++;
        
        if (maxLevel < level) {
            maxLevel = level; 
        }

        if (b.metadata.childs) {
            for (var i=0; i<b.metadata.childs.length; i++) {
                _setLevels(data, b.metadata.childs[i], level+1);
            }
        }
    }
    
    _setLevels(data, data.root, 0);
    
    return maxLevel+1;
}

function prepare (data) {
    for (var b in data.branchs) {
        var branch = data.branchs[b];
        var parent = branch.data.parent;
        var parentBranch;
        
        branch.metadata.id = b;
        
        if (parent) {
            if (typeof parent === 'string') {
                parentBranch = data.branchs[parent];
                
                parentBranch.metadata.childs = parentBranch.metadata.childs || [];
                if (parentBranch.metadata.childs.indexOf(b) === -1) {
                    parentBranch.metadata.childs.push(b);
                }
            }
            else {
                for (var p=0; p<parent.length; p++) {
                    parentBranch = data.branchs[parent[p]];
                
                    parentBranch.metadata.childs = parentBranch.metadata.childs || [];
                    if (parentBranch.metadata.childs.indexOf(b) === -1) {
                        parentBranch.metadata.childs.push(b);
                    }
                }
            }
        }
    }
    
    var levels = setLevels(data);
    // setup coordinates,
    for (var i in data.levels) {
        i = +i;
        var branches = data.levels[i];
        
        for (var j=0; j<branches.length; j++) {
            var branch = data.branchs[branches[j]];
            
            branch.metadata.geometry = {
                position: {
                    x: (1/(branches.length+1)) * (j+1),
                    y: (1/(levels+1)) * (i+1)
                }
            }
        }
    }
}

Run.prototype.init = function (el) {
    var self = this;

    this.container = document.createElement("div");
    this.container.style.width = '100%';
    
    this.container.setAttribute("rv-show", "show");

    templates.load(this.container, "./templates/run.html", this).then(
        function () {
            prepare(self.data.run);

            var tree = d3.select(self.container).select(".run-tree")
                .call(d3.zoom().on("zoom", function () {
                    tree.attr("transform", d3.event.transform);
                }))
                .append("g");
            

            for (var b in self.data.run.branchs) {
                var branch = self.data.run.branchs[b];

                if (branch.metadata.childs) {
                    for (var i=0; i<branch.metadata.childs.length; i++) {
                        var childBranch = self.data.run.branchs[branch.metadata.childs[i]];
                        
                        tree.append("line")
                            .attr("x1", branch.metadata.geometry.position.x)
                            .attr("y1", branch.metadata.geometry.position.y)
                            .attr("x2", childBranch.metadata.geometry.position.x)
                            .attr("y2", childBranch.metadata.geometry.position.y)
                            .attr("stroke-width", 0.01);
                    }
                }
                
                tree.append("circle")
                    .attr("cx", branch.metadata.geometry.position.x)
                    .attr("cy", branch.metadata.geometry.position.y)
                    .attr("r", 0.02)
                    .on("click", function () {
                        self.info = this.branch.metadata.id;
                    }.bind({branch: branch}));
            }

            /*
            var tree = d3.select(self.container).select(".run-tree");
                tree.append("circle")
                    .attr("cx", 0.2)
                    .attr("cy", 0.2)
                    .attr("r", 0.1);
                    
                tree.append("circle")
                    .attr("cx", 0.8)
                    .attr("cy", 0.8)
                    .attr("r", 0.1);
                
                tree.append("line")
                    .attr("x1", 0.2)
                    .attr("y1", 0.2)
                    .attr("x2", 0.8)
                    .attr("y2", 0.8)
                    .attr("stroke-width", 0.01);
                    // .attr("stroke", "black");
            */
        }
    );

    el.appendChild(this.container);
};

module.exports = Run;
