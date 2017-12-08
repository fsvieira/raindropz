var templates = require("../services/templates");
var d3 = require("d3");
var getSession = require("../services/z/zsession");

class Run {
    constructor (file, el) {
        this.name = file.name;
        this.icon = "typcn typcn-media-play";
        this.id = file.id;
        this.data = file;

        const session = getSession(file.id);
        session.add(file.id);

        this.tree = {
            data: {},
            levels: {},
            nodes: [],
            links: []
        };

        this.init(el).then(() => {
            // listen to other updates,
            session.events.on('update', (tree) => {
                if (session.tree.root && !this.tree.data[session.tree.root]) {
                    this.addNode(session.tree.data[session.tree.root]);
                }

                this.draw(tree);
            });
            
            if (session.tree.root) {
                this.addNode(session.tree.data[session.tree.root]);
                this.draw(session.tree);
            }
        });
    }
    
    updateCoords () {
        var maxLevel = 0;
        var maxLevelNodes = 0;
                
        for (var i in this.tree.levels) {
            const level = +i;
            if (maxLevel < level) {
                maxLevel = level;
            }
                        
            if (maxLevelNodes < this.tree.levels[i].length) {
                maxLevelNodes = this.tree.levels[i].length;
            }
        }

        const yh = 1 / (maxLevel + 1);
        const ym = yh / 2;

        const xw = 1 / (maxLevelNodes + 1);
        const r = xw>yh?yh*0.1:xw*0.1;

        this.tree.nodes.forEach((branch) => {
            const branchesIds = this.tree.levels[branch.data.level];
            const x = branchesIds.indexOf(branch.metadata.id);
    
            const xw = 1 / branchesIds.length;
            const xm = xw / 2;

            branch.metadata.geometry = {
                cx: xm + x * xw,
                cy: ym + branch.data.level * yh,
                r: r,
                line: r*0.5
            };    
        });
    }
    
    addNode (branch) {
        const branchId = branch.metadata.id;
        
        if (!this.tree.data[branchId]) {
            this.tree.data[branchId] = branch;
            this.tree.nodes.push(branch);
            this.tree.levels[branch.data.level] = this.tree.levels[branch.data.level] || [];
            this.tree.levels[branch.data.level].push(branchId);
        }
    }
    
    removeNode (branch) {
        const branchId = branch.metadata.id;
        
        if (this.tree.data[branchId]) {
            branch.metadata.expanded = false;
            const l = this.tree.levels[branch.data.level];
            delete this.tree.data[branchId];
            l.splice(l.indexOf(branchId), 1);
            
            this.tree.nodes.splice(this.tree.nodes.indexOf(branch), 1);
            
            if (l.length === 0) {
                delete this.tree.levels[branch.data.level];
            }

            for (var i=this.tree.links.length-1; i>=0; i--) {
                const link = this.tree.links[i];
                
                if (link.parent === branch || link.child === branch) {
                    this.tree.links.splice(i, 1);
                }
            }
            
            this.tree.nodes.filter((branch) => {
                return branch.data.parent !== undefined && 
                (branch.data.parent instanceof Array?branch.data.parent.indexOf(branchId) !== -1:branch.data.parent === branchId);
            }).forEach((branch) => {this.removeNode(branch)});
        }
    }
    
    draw (sTree) {
        this.updateCoords();
        
        function color (branch) {
            const childs = sTree.childs[branch.metadata.id];
            // TODO: check if branch fails,
            if (branch.metadata.status) {
                if (branch.metadata.status.fail) {
                    return "#FF0000";
                }
                else if (branch.metadata.status.end) {
                    return "#00FF00";
                }
            }
            
            if (childs) {
                return "#0FCCDC";
            }
            else {
                return "black";
            }
        }
        
        function dataTrack (d) {
            if (d.metadata) {
                return d.metadata.id;
            }
            else {
                return d.parent.metadata.id + "_" + d.child.metadata.id;
            }
        }
        
        // remove,
        this.elLinks
            .selectAll("line")
            .data(this.tree.links, dataTrack)
            .exit()
            .remove()
            .transition()
            .duration(750)
            .delay(function(d, i) { return i * 10; });
            
        this.elNodes
            .selectAll("circle")
            .data(this.tree.nodes, dataTrack)
            .exit()
            .remove()
            .transition()
            .duration(750)
            .delay(function(d, i) { return i * 10; });
        
        // update,
        this.elLinks
            .selectAll("line")
            .data(this.tree.links, dataTrack)
            .transition()
            .duration(750)
            .delay(function(d, i) { return i * 10; })
            .attr("x1", function ({parent: branch}) {
                return branch.metadata.geometry.cx;
            })
            .attr("y1", function ({parent: branch}) {
                return branch.metadata.geometry.cy;
            })
            .attr("x2", function ({child: branch}) {
                return branch.metadata.geometry.cx;
            })
            .attr("y2", function ({child: branch}) {
                return branch.metadata.geometry.cy;
            })
            .attr("stroke-width", function ({parent: branch}) {
                return branch.metadata.geometry.line;
            });
        
        this.elNodes
            .selectAll("circle")
            .data(this.tree.nodes, dataTrack)
            .transition()
            .duration(750)
            .delay(function(d, i) { return i * 10; })
            .attr("cx", function (branch) {
                return branch.metadata.geometry.cx;
            })
            .attr("cy", function (branch) {
                return branch.metadata.geometry.cy;
            })
            .attr("r", function (branch) {
                return branch.metadata.geometry.r;
            })
            .attr("fill", color);
            
        // add
        this.elLinks
            .selectAll("line")
            .data(this.tree.links, dataTrack)
            .enter()
            .append("line")
            .transition()
            .duration(750)
            .delay(function(d, i) { return i * 10; })
            .attr("x1", function ({parent: branch}) {
                return branch.metadata.geometry.cx;
            })
            .attr("y1", function ({parent: branch}) {
                return branch.metadata.geometry.cy;
            })
            .attr("x2", function ({child: branch}) {
                return branch.metadata.geometry.cx;
            })
            .attr("y2", function ({child: branch}) {
                return branch.metadata.geometry.cy;
            })
            .attr("stroke-width", function ({parent: branch}) {
                return branch.metadata.geometry.line;
            })
            .attr("stroke", "black")
            .attr("class", "link");
            
        this.elNodes
            .selectAll("circle")
            .data(this.tree.nodes, dataTrack)
            .enter()
            .append("circle")
            .on('click', (branch) => {
                // check if branch has children,
                const childs = sTree.childs[branch.metadata.id];

                if (branch.metadata.expanded) {
                    branch.metadata.expanded = false;
                    childs.forEach((child) => {
                        this.removeNode(child);
                    });
                    
                    this.draw(sTree);
                }
                else if (childs) {
                    branch.metadata.expanded = true;

                    childs.forEach((child) => {
                        this.addNode(child);
                        this.tree.links.push({parent: branch, child});
                    });

                    this.draw(sTree);
                }
                
                this.info = {
                    prettyHTML: branch.metadata.prettyHTML
                };
            })
            .transition()
            .duration(750)
            .delay(function(d, i) { return i * 10; })
            .attr("cx", function (branch) {
                return branch.metadata.geometry.cx;
            })
            .attr("cy", function (branch) {
                return branch.metadata.geometry.cy;
            })
            .attr("r", function (branch) {
                return branch.metadata.geometry.r;
            })
            .attr("fill", color);
    }
    
    init (el) {
        return templates.load(el, "./templates/run.html", this).then(
            () => {
                this.elLinks = d3.select(el).select(".run-tree")
                    .append("g");
                    
                this.elNodes = d3.select(el).select(".run-tree")
                    .call(d3.zoom().on("zoom", () => {
                        this.elLinks.attr("transform", d3.event.transform);
                        this.elNodes.attr("transform", d3.event.transform);
                    }))
                    .append("g");
            }
        );
    }
}


module.exports = Run;
