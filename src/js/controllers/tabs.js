var events = require('../services/events');
var templates = require('../services/templates');

var Editor = require('./editor');
var Run = require('./run');
var Settings = require('./settings');

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
    var isHover = false;
    
    // Set widget chooser
    var container = document.createElement("div");
    container.style.width = '100%';
    container.setAttribute("rv-show", "showWidgetsList");

    templates.load(container, "./templates/select_widget.html", this).then(function () {
        document.getElementById("rz-tabs-content").appendChild(container);
    });
    
    this.hover = function () {
        if (!isHover && self.widgets.length > 1) {
            isHover = true;
            self.tabs.active.active.show = false;
            for (var i=0; i < self.tabs.groups.length; i++) {
                self.tabs.groups[i].showWidgetsList = false;
            }
            self.showWidgetsList = true;
        }
    };
    
    this.leave = function () {
        isHover = false;
    };
    
    this.click = function () {
        self.active.show = true;
        self.tabs.active.active.show = false;
        self.showWidgetsList = false;
        self.tabs.select(self);
    };
};

Group.prototype.setItem = function (data, Widget, widget) {
    var self = this;
    
    widget = widget || this.widgets.find(
        function (a) {
            return a.id === data.id;
        }
    );
    
    if (!widget) {
        var container = document.createElement("div");
        container.style.width = '100%';
        container.setAttribute("rv-show", "show");
        document.getElementById("rz-tabs-content").appendChild(container);
        
        widget = new Widget(data, container);
        this.widgets.push(widget);
        
        widget.open = function () {
            self.setItem(undefined, undefined, widget);
            self.active.show = true;
            self.tabs.active.active.show = false;
            self.showWidgetsList = false;
            self.tabs.select(self);
        };
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

    events.on("settings", function (data) {
        var settings = self.group("settings");
        
        settings.setItem(data, Settings);
        self.select(settings);
    });
  
    templates.load("rz-workarea", "./templates/tabs.html", this);
};


module.exports = Tabs;