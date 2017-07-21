var templates = require("../services/templates");
var filesystem = require("../services/filesystem");
var run = require("../services/run");
var events = require("../services/events");

function Editor (file, el) {
    /*
        Setup info for tab,
    */
    this.name = file.name;
    this.icon = file.icon;
    this.id = file.id;

    // set stuff,
    this.file = file;
    this.init(el);
}

Editor.prototype.save = function () {
    
};

Editor.prototype.init = function (el) {
    var self = this;
    
    this.file.loading = true;
    var dataChange;
    
    filesystem.open(self.file.id).then(function (data) {
        dataChange = data;
        self.file.data = data;
        self.file.loading = false;
    });
    
    this.update = function (el) {
        dataChange = this.value;
        self.file.change = self.file.data !== dataChange;
    };
    
    function save () {
        return filesystem.write(self.file.id, dataChange).then(function (id) {
            self.file.change = false;
            return id;
        });
    }
    
    this.save = save;
    
    this.run = function (el) {
        return save().then(function (id) {
            /*
            return run.run(id).then(function (result) {
                events.trigger("run", result);
                return result;
            });*/
            events.trigger("run", self.file);
            return self.file;
        });
    };
    
    templates.load(el, "./templates/editor.html", this);
};

module.exports = Editor;
