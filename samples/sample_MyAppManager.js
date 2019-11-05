const AppManager = require("./appManagerClass.js");

class myAppManager extends AppManager{
    bleMyConfig(){
        console.log('Setting up TeslaCharge specfic characteristics and config...'); 
        var carVIN = this.bPrl.Characteristic('9160f92b-34f2-4c23-bd4b-e88fd4dd7bd9', 'carVIN', ["encrypt-read","encrypt-write"]);
        carVIN.on('WriteValue', (device, arg1)=>{
            console.log(device + ', has set new car VIN.');
            carVIN.setValue(arg1);
            var x = arg1.toString('utf8');
            this.saveItem({carVIN:x});        //this will add {varName : Value} to this.config.  In this case to access the carVIN use this.config.carVIN
        });
        carVIN.on('ReadValue', (device)=>{
            console.log(device + ' has connected and is reading carVIN');
            carVIN.setValue(this.config.carVIN);
            return (this.config.carVIN);
        });
        carVIN.setValue(this.config.carVIN);

        var kwhCost = this.bPrl.Characteristic('c694e8cd-8665-4dae-86f6-8bcdbbbff23c', 'kwhCost', ["encrypt-read","encrypt-write"]);
        kwhCost.on('WriteValue', (device, arg1)=>{
            console.log(device + ', has set a new kwhCost.');
            kwhCost.setValue(arg1);
            var x = arg1.toString('utf8');
            this.saveItem({kwhCost:x});        //this will add {varName : Value} to this.config.  In this case to access the kwhCost use this.config.kwhCost
        });
        kwhCost.on('ReadValue', (device)=>{
            console.log(device + ' has connected and is reading kwhCost');
            kwhCost.setValue(this.config.kwhCost);
            return (this.config.kwhCost);
        });
        kwhCost.setValue(this.config.kwhCost);

    };
};

module.exports = myAppManager;