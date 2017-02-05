var events = require('../services/events');
var templates = require('../services/templates');
var Editor = require('./editor');
var Run = require('./run');

function Tabs (el) {
    this.el = el;
    this.groups = [];

    this.init();
}

var groups = {};

function Group (name, tabs) {
    this.tabs = tabs;
    this.name = name;
    this.widgets = [];
    
    this.init();
}

Group.prototype.init = function () {
    var self = this;
    this.hover = function () {
        if (self.tabs.active === self) {
            console.log("ACTIVE");
        }
        console.log("HOVER: " + self.name);
    };
    
    this.click = function () {
        self.active.show = true;
        self.tabs.select(self); 
    };
};

Group.prototype.setItem = function (data, Widget) {
    var widget = this.widgets.find(
        function (a) {
            return a.id === data.id;
        }
    );
    
    if (!widget) {
        widget = new Widget(data, document.getElementById("rz-tabs-content"));
        this.widgets.push(widget);
    }
    
    if (this.active) {
        this.active.show = false;
    }
    
    this.active = widget;
    this.active.show = true;
};

Tabs.prototype.group = function (name) {
    var group = groups[name];
    if (!group) {
        groups[name] = group = new Group(name, this);
        
        this.groups.push(group);
    }

    return group;    
};

Tabs.prototype.select = function (group) {
    if (this.active) {
        this.active.active.show = false;
        this.active.show = false;
    }
    
    this.active = group;
    this.active.show = true;
    this.active.active.show = true;
};

Tabs.prototype.init = function () {
    var self = this;
  
    events.on("open-file", function (data) {
        var files = self.group("files");
      
        files.setItem(data, Editor);
        self.select(files);
    });
  
    events.on("run", function (data) {
        var runs = self.group("runs");
        
        runs.setItem(data, Run);
        self.select(runs);
    });
  
    templates.load("rz-workarea", "./templates/tabs.html", this);
};


module.exports = Tabs;