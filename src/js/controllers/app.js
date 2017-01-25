var templates = require('../services/templates');
var FileTree = require('./filetree');

function App () {
    this.scope = {};
    this.init();
}

App.prototype.init = function () {
    templates.load("rz-app", './templates/app.html', this.scope).then(
        function () {
            new FileTree("rz-filetree");
        }
    );
};

module.exports = App;
