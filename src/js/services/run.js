var filesystem = require("./filesystem");
var Z = require("../lib/z");

function run (id) {
    // get data from file.
    return filesystem.open(id).then(function (data) {
        return filesystem.attributes(id).then(function (attr) {
            attr.data = data;
            
            var z = new Z();
            z.add(data);

            return {
                file: attr,
                run: z.zvs.objects
            };
        });
    });
}



module.exports = {
    run: run
};
