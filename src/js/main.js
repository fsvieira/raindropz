(function () {
    require("promise-polyfill");
    require("whatwg-fetch");

    var App = require('./controllers/app');
    
    new App();

})();


