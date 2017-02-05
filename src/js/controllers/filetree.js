var templates = require('../services/templates');
var filesystem = require('../services/filesystem');
var events = require('../services/events');

function fileicon (file) {
	var icon;
	var directory = file.type === filesystem.types.DIRECTORY;
	var open = file.childs;
	if (directory) {
		if (open) {
			icon = "typcn typcn-folder-open";
		}
		else {
			icon = "typcn typcn-folder";
		}
	}
	else {
		if (open) {
			icon = "typcn typcn-document-text open";
		}
		else {
			icon = "typcn typcn-document-text";
		}
	}
	
	return icon;
}

function showSettings () {
	/*if (this.file.childs) {
		templates.load(
			"rz-work-area", 
			"./templates/directory_settings.html",
			this.file
		);
	}
	else {
		templates.load(
			"rz-work-area", 
			"./templates/file_settings.html",
			this.file
		);
	}*/
	events.trigger("settings", this.file);
}

function unbind (files) {
	if (files) {
		for (var i=0; i<files.length; i++) {
			var file = files[i];
			if (file.view) {
				file.view.unbind();
				unbind(file.childs);
				file.childs = undefined;
				file.el.innerHTML = "";
			}
		}
	}
}

function open () {
	var file = this.file;

	if (file.type === filesystem.types.DIRECTORY) {
		if (file.childs) {
			unbind(file.childs);
			file.childs = undefined;
			file.icon = fileicon(file);
		}
		else {
			filesystem.ls(file.id).then(
				function (childs) {
					file.childs = childs;
					file.icon = fileicon(file);
				}
			);
		}
	}
	else {
		events.trigger("open-file", file);
	}
	
}

// TODO: save/load file tree state, 
function filetree (el, files) {
	if (files) {
		for (var i=0; i<files.length; i++) {
			var file = files[i];
			file.icon = fileicon(file);

			var div = document.createElement("div");
			file.el = el;
			file.showSettings = showSettings.bind({file: file});
			file.open = open.bind({file: file});
			el.appendChild(div);

			templates.load(div, "./templates/filetree.html", file);
		}
	}
}

templates.binders.filetree = function (el, files) {
	filetree(el, files);
};

function FileTree (el) {
    this.init(el);
}

FileTree.prototype.init = function (el, elWorkArea) {
	filesystem.create(
     	"introduction.z", 
     	{
     		silent: true,
     		type: filesystem.types.FILE,
     		data: "(yellow red)\n(yellow blue)\n?('x 'y)\n"
     	}
     ).then(function () {
	    filesystem.ls().then(function (root) {
	    	filetree(
	    		document.getElementById(el),
	    		root
			);
	    });
     });
};

module.exports = FileTree;
