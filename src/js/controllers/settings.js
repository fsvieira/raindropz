var templates = require("../services/templates");
var filesystem = require("../services/filesystem");

function Settings (file, el) {
    this.name = file.name;
    this.icon = "typcn typcn-spanner";
    this.id = file.id;

    this.file = file;
    this.init(el);
}

Settings.prototype.init = function (el) {
	var self = this;
	
	this.inputs = {
		directory: "",
		file: ""
	};
	
    if (this.file.type === filesystem.types.DIRECTORY) {
    	this.createDirectory = function () {
    		filesystem.create(
		     	self.inputs.directory, 
				{
					type: filesystem.types.DIRECTORY,
					parentID: self.file.id
				}
			).then(function () {
				self.inputs.directory = "";
			});
    	};

    	this.createFile = function () {
    		filesystem.create(
		     	self.inputs.file, 
				{
					type: filesystem.types.FILE,
					parentID: self.file.id,
					data: ""
				}
			).then(function () {
				self.inputs.file = "";
			});
    	};
    	
    	this.removeDirectory = function () {
    		filesystem.remove(self.file.id);
    	};

		templates.load(
			el,
			"./templates/directory_settings.html",
			this
		);
	}
	else {
		templates.load(
            el,
			"./templates/file_settings.html",
			this
		);
	}
};


module.exports = Settings;