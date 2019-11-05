const AppManager = require("./appManagerClass.js");

class myAppManager extends AppManager{
    bleMyConfig(){
        console.log('Setting up Battery life expectancy characteristics...');
        var battLastReplaced = this.bPrl.Characteristic('6b52b1c4-9b30-4851-84f8-b48d27b730a3', 'battLastReplaced', ["encrypt-read","encrypt-write"]);
        battLastReplaced.on('WriteValue', (device, arg1)=>{
            console.log(device + ', has set new battLastReplaced.');
            battLastReplaced.setValue(arg1);
            var x = arg1.toString('utf8');
            this.saveItem({battLastReplaced:x});        //this will add {varName : Value} to this.config.  In this case to access the battLastReplaced use this.config.battLastReplaced
        });
        battLastReplaced.on('ReadValue', (device)=>{
            console.log(device + ' has connected and is reading battLastReplaced');
            battLastReplaced.setValue(this.config.battLastReplaced);
            return (this.config.battLastReplaced);
        });
        battLastReplaced.setValue(this.config.battLastReplaced);
    };
};

module.exports = myAppManager;