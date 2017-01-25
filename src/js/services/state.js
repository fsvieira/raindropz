var state = {
    files: [
        {
            name: "root", 
            files: [
                {name: "set.z", data: "(yellow and stuff)", icon: 'typcn typcn-document-text'}
            ],
            icon: 'typcn typcn-folder-open',
            // settings: false
        }
    ]
};

(function (file) {
	/* if we want to have hidden attr, that will not appear on json strinigfy
	Object.defineProperty(file, 'settings', {
	  value: false,
	  writable: true,
	  enumerable: false,
	  configurable: true
	});*/
	
	file.showSettings = function () {
		console.log(file.settings);
		file.settings = !file.settings;
	};
})(state.files[0]);

console.log(JSON.stringify(state, null, '\t'));

/*
	Files,
	TODO: decide where to put this, or make it general
*/
function fileicon (el, directory, open) {
	var icon;
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

function getState () {
    return new Promise(function (resolve, reject) {
       resolve(state);
    });
}

module.exports = {
    getState: getState
};


