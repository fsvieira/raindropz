var templates = require("../services/templates");
var d3 = require("d3");

function Run (data, el) {
    this.name = data.file.name;
    this.icon = "typcn typcn-media-play";
    this.id = data.file.id;

    this.data = data;
    
    this.init(el);
}


function setLevels (data, branch, level) {
    var order = 0;
    
    data.levels = {};
    
    var maxLevel = 0;
    
    function _setLevels (data, branch, level) {
        var b = data.branchs[branch];

        if (b.metadata.level === undefined || b.metadata.level < level) {
            b.metadata.level = level;
        }
        
        if (b.metadata.order === undefined) {
            b.metadata.order = order++;
        }
        
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

    for (var branch in data.branchs) {
        var b = data.branchs[branch];
        
        data.levels[b.metadata.level] = data.levels[b.metadata.level] || [];
        data.levels[b.metadata.level].push(branch);
    }

    for (var level in data.levels) {
        var branches = data.levels[level];
        
        branches.sort(function (a, b) {
            var branchA = data.branchs[a];
            var branchB = data.branchs[b];

            return branchA.metadata.order - branchB.metadata.order;
        });
    }
    
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
    var levelsMargin = 1 / (levels +1);

    for (var i in data.levels) {
        var branches = data.levels[i];
        i = +i;

        for (var j=0; j<branches.length; j++) {
            branch = data.branchs[branches[j]];

            branch.metadata.geometry = {
                position: {
                    x: (1/(branches.length+1)) * (j+1),
                    y: levelsMargin * (i+1),
                    r: levelsMargin * 0.1
                }
            };
        }
    }
}



Run.prototype.init = function (el) {
    var self = this;

    templates.load(el, "./templates/run.html", this).then(
        function () {
            prepare(self.data.run);

            var tree = d3.select(el).select(".run-tree")
                .call(d3.zoom().on("zoom", function () {
                    tree.attr("transform", d3.event.transform);
                }))
                .append("g");
            
            var selectedBranch;

            for (var b in self.data.run.branchs) {
                var branch = self.data.run.branchs[b];

                if (branch.metadata.childs) {
                    for (var i=0; i<branch.metadata.childs.length; i++) {
                        var childBranch = self.data.run.branchs[branch.metadata.childs[i]];
                        
                        var line = tree.append("line")
                            .attr("x1", branch.metadata.geometry.position.x)
                            .attr("y1", branch.metadata.geometry.position.y)
                            .attr("x2", childBranch.metadata.geometry.position.x)
                            .attr("y2", childBranch.metadata.geometry.position.y)
                            .attr("stroke-width", 0.001)
                            .attr("stroke", "red");
                            
                        branch.metadata.geometry.links = branch.metadata.geometry.links || [];
                        childBranch.metadata.geometry.links = childBranch.metadata.geometry.links || [];

                        branch.metadata.geometry.links.push({line: line, branch: childBranch});
                        childBranch.metadata.geometry.links.push({line: line, branch: branch});
                    }
                }
                
                var circle = tree.append("circle")
                    .attr("cx", branch.metadata.geometry.position.x)
                    .attr("cy", branch.metadata.geometry.position.y)
                    .attr("r", branch.metadata.geometry.position.r);
                
                if (branch.metadata.fail) {
                    circle.attr("fill", "red");
                }
                
                branch.metadata.geometry.node = circle;    
                    
                circle.on("click",
                    function () {
                        console.log("Click!!");
                        self.info = {
                            prettyHTML: this.branch.metadata.prettyHTML
                        };
                        
                        if (selectedBranch) {
                            selectedBranch.metadata.geometry.node.style("fill", "blue");
                            
                            selectedBranch.metadata.geometry.links.forEach(function (link) {
                                link.line.attr("stroke", "red");
                                link.branch.metadata.geometry.node.attr("fill", "orange");
                            });
                        }
                        
                        this.node.style("fill", "lime");
                        selectedBranch = this.branch;
                            
                        this.branch.metadata.geometry.links.forEach(function (link) {
                            link.line.attr("stroke", "green");
                            link.branch.metadata.geometry.node.attr("fill", "green");
                        });
                    }.bind({
                        branch: branch, 
                        node: circle
                    })
                );
            }
        }
    );
};

module.exports = Run;
