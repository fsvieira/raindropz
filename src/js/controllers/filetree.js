var templates = require('../services/templates');
var state = require('../services/state');

function filetree (el, files) {
	if (files) {
		for (var i=0; i<files.length; i++) {
			var file = files[i];
			var div = document.createElement("div");
			templates.load(div, "./templates/filetree.html", file);
			el.appendChild(div);
		}
	}
}

templates.binders.filetree = function (el, files) {
	filetree(el, files);
};

function FileTree (el) {
    this.init(el);
}

FileTree.prototype.init = function (el) {
    state.getState().then(function (state) {
        filetree(document.getElementById(el), state.files);
    });
};

module.exports = FileTree;
