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
    if (this.file.type === filesystem.types.DIRECTORY) {
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