var rivets = require('rivets');
var moment = require('moment');

var languages;

rivets.binders["attr-class"] = function(el, value) {
	el.className = value;
};

/*
rivets.binders.width = function(el, value) {
	el.style.width = value + "%";
};

rivets.binders.image = function (el, value) {
	el.style.backgroundImage = 'url(' + value + ')';
};

rivets.formatters.date = function (value) {
	return moment(value).format('L');
};

rivets.formatters.translate = function (language, value) {
	return languages[language][value];
};
*/

rivets.load = function (elem, file, state) {
	return fetch(file).then(
		function (html) {
			if (html.status === 200) {
				var el = elem;

				if (typeof elem === 'string') {
					el = document.getElementById(elem);
				}
					
				return html.text().then(
					function (html) {
						el.innerHTML = html;
						state.view = rivets.bind(el, state);
						return state;
					}
				);
					
			}
			else {
				return Promise.reject(html);
			}
		},
		function (error) {
			console.log(error);
			return error;
		}
	);
};


module.exports = rivets;

