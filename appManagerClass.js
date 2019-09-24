const fs =              require("fs");
const cp =              require('child_process');
const EventEmitter =    require('events');
const irTransmitter =   require('irdtxclass');
const BLEperipheral =   require("ble-peripheral");
const Crypto =          require("cipher").encryption;

var self;
var crypto = {};
var encrytionKey = null

/**
 * This class provides an interface to the gauge’s factory default configuration settings. Typically, these settings are stored in a file called gaugeConfig.json, with user modifications to the factory defaults in a file called modifiedConfig.json. 
 * This class also provides a frontend to the irdTxClass and  blePeripheral class in the setGaugeStatus and setGaugeValue methods.
 * 
 * ** * gaugConfig.json must have key fields such as UUID and dBusName and conform to a JSON format.  See the README.md for details or the smaple file located in ./samples/sample_gaugeConfig.json **
 * 
 * typical setup call ->const myAppMan = new AppMan(__dirname + '/gaugeConfig.json', __dirname + '/modifiedConfig.json');<-
 * 
 * @param {string} defaultGaugeConfigPath gaugeConfig.json location. Example: (__dirname + '/gaugeConfig.json'). This file must exist see ./samples/sample_gaugeConfig.json for an example format
 * @param {string} modifiedConfigMasterPath modifiedConfig.json location. Example: (__dirname + '/modifiedConfig.json'). This file will be created on first write if it doesn't exist. 
 */
class appManager extends EventEmitter{
    constructor(defaultGaugeConfigPath = '', modifiedConfigMasterPath = ''){
        super();
        getDataEncryptionKey();
        this.defaultConfigFilepath = defaultGaugeConfigPath;
        this.defaultConfigMaster = {};      
        if (fs.existsSync(this.defaultConfigFilepath)){
            this.defaultConfigMaster = JSON.parse(fs.readFileSync(this.defaultConfigFilepath))
        } else {
            console.log('Error Config file located at ' + this.defaultConfigFilepath + ', not found!');
            console.log('From:' + __filename);
            throw new Error('Default Config File not found.');
        };
        this.modifiedConfigFilePath = modifiedConfigMasterPath;
        this.modifiedConfigMaster = {};
        if (fs.existsSync(this.modifiedConfigFilePath)){this.modifiedConfigMaster = JSON.parse(fs.readFileSync(this.modifiedConfigFilePath))};

        this.config = {...this.defaultConfigMaster, ...this.modifiedConfigMaster};
        this.status = 'ipl, ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString();
        this.value = 'Not Set Yet';
        this._okToSend = true;
        this.gTx = new irTransmitter(this.config.gaugeIrAddress, this.config.calibrationTable);
        this.bPrl = new BLEperipheral(this.config.dBusName, this.config.uuid, this._bleConfig, false);
        self = this;  

        this.bPrl.on('ConnectionChange', (connected)=>{
            var bleUserName = '';
            if(this.bPrl.client.name == ''){
              bleUserName = this.bPrl.client.devicePath;
            } else {
              bleUserName = this.bPrl.client.name;
            };
            if(connected == true){
              console.log('--> ' + bleUserName + ' has connected to this server at ' + (new Date()).toLocaleTimeString());
              if(this.bPrl.client.paired == false){
                console.log('--> CAUTION: This BLE device is not authenticated.');
              }
            } else {
              console.log('<-- ' + bleUserName + ' has disconnected from this server at ' + (new Date()).toLocaleTimeString());
              if(this.bPrl.areAnyCharacteristicsNotifying() == true){
                console.log('Restarting gatt services to cleanup leftover notifications...')
                this.bPrl.restartGattService();
              };
            };
        });
    };

    /** Transmits gauge vlaue to irTxServer, also sets BLE gauge vlaue and fires BLE notify
     * 
     * @param {*} value is the gauge vlue
     * @param {string} descripition is an optional description of value
     */
    setGaugeValue(value, descripition = ''){
        if(this._okToSend){
            this.gTx.sendValue(value);
        } else {
            this.setGaugeStatus('Warining: Gauge value transmission not allowed during adminstration.')
            return false;
        };
        var logValue = value.toString() + ', ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString();
        if(descripition != ''){
            logValue = value.toString() + descripition.toString();
        };
        
        this.value = logValue;
        this.gaugeValue.setValue(logValue);

        if(this.gaugeValue.iface.Notifying && this.bPrl.client.connected){
            this.gaugeValue.notify();
        };
        return true;
    };

    /** Sets BLE gaugeStatus and fires BLE notify
     * 
     * @param {string} statusStr status string to set. Suggest including a time stamp in the string for exampel 'Okay, 8:14:25AM, 2/10/2019'
     */
    setGaugeStatus(statusStr){
        this.status = statusStr;
        this.gaugeStatus.setValue(statusStr);

        if(this.gaugeStatus.iface.Notifying && this.bPrl.client.connected){
            this.gaugeStatus.notify();
        };
    };  
    
    sendAlert(objectToSend = {[this.config.descripition]:"1"}){
        console.log('Sending Alert....')
        console.dir(objectToSend,{depth:null});
        try{
        //var objAsStr = JSON.stringify(objectToSend);
        //var asArry = objAsStr.split('');
        var asArry = JSON.stringify(objectToSend).split('');
        var nums = '[';
        asArry.forEach((val, indx)=>{
            nums += '0x' + val.charCodeAt().toString(16);
            if(indx + 1 != asArry.length){nums += ','};
        })
        nums += ']';
        console.log('Calling gdbus to send alert to rgMan...');
        //var result = cp.execSync("/usr/bin/gdbus call --system --dest com.rgMan --object-path /com/rgMan/gaugeAlert --method org.bluez.GattCharacteristic1.WriteValue " + nums);
        var result = cp.execSync("/usr/bin/dbus-send --system --dest=com.rgMan --print-reply=literal /com/rgMan/gaugeAlert org.bluez.GattCharacteristic1.WriteValue string:" + nums);
        console.log('result = ' + result);
        } catch(err){
            console.log('Error when trying to sendAlert to rgMan ' + err);
        };
    };

    /** This is a blank method that can be extended. 
     * This method will be called after _bleMasterConfig() allowing custom characteristics to be added.
     */
    bleMyConfig(){
        console.log('bleMyConfig not extended, there will not be any unique app characteristics set.  Using defaults only.');
    };

    /** Saves custom config items to the config file located in modifiedConfigMasterPath 
     * Item to be saved should be in key:value format.  For example to seave the IP address of a device call this method with
     * saveItem({webBoxIP:'10.10.10.12});
     * @param {Object} itemsToSaveAsObject 
     */
    saveItem(itemsToSaveAsObject){
        console.log('saveItem called with:');
        console.log(itemsToSaveAsObject);
    
        var itemList = Object.keys(itemsToSaveAsObject);
        itemList.forEach((keyName)=>{
            this.modifiedConfigMaster[keyName] = itemsToSaveAsObject[keyName];
        })
        console.log('Writting file to ' + this.modifiedConfigFilePath);
        fs.writeFileSync(this.modifiedConfigFilePath, JSON.stringify(this.modifiedConfigMaster));
        this._reloadConfig();
    };

    _reloadConfig(){
        console.log('config reloading...');
        this.modifiedConfigMaster = {};
        if (fs.existsSync(this.modifiedConfigFilePath)){
            this.modifiedConfigMaster = JSON.parse(fs.readFileSync(this.modifiedConfigFilePath))
        };
        this.config = {...this.defaultConfigMaster, ...this.modifiedConfigMaster};
        this.gaugeConfig.setValue(JSON.stringify(this.config));
        console.log('firing "Update" event...');
        this.emit('Update');
    };

    _bleConfig(DBus){
        self._bleMasterConfig();
        self.bleMyConfig();
    }

    _bleMasterConfig(){
        //this.bPrl.logCharacteristicsIO = true;
        //this.bPrl.logAllDBusMessages = true;
        console.log('Initialize charcteristics...')
        this.appVer =       this.bPrl.Characteristic('001d6a44-2551-4342-83c9-c18a16a3afa5', 'appVer', ["encrypt-read"]);
        this.gaugeStatus =  this.bPrl.Characteristic('002d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeStatus', ["encrypt-read","notify"]);
        this.gaugeValue =   this.bPrl.Characteristic('003d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeValue', ["encrypt-read","notify"]);
        this.gaugeCommand = this.bPrl.Characteristic('004d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeCommand', ["encrypt-read","encrypt-write"]);
        this.gaugeConfig =  this.bPrl.Characteristic('005d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeConfig', ["encrypt-read"]);
    
        console.log('Registering event handlers...');
        this.gaugeCommand.on('WriteValue', (device, arg1)=>{
            var cmdNum = arg1.toString()
            //var cmdValue = arg1[1]
            var cmdResult = 'okay';
            console.log(device + ' has sent a new gauge command: number = ' + cmdNum);
    
            switch (cmdNum) {
                case '0':   
                    console.log('Sending test battery to gauge...');
                    console.log('Disabling sending of gauge value during adminstration.');
                    this._okToSend = false;
                    this.setGaugeStatus('Sending test battery command to gauge. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this.gTx.sendEncodedCmd(this.gTx.encodeCmd(this.gTx._cmdList.Check_Battery_Voltage));
                break;
        
                case '1':  
                    console.log('Disabling sending of gauge value during adminstration.');
                    this._okToSend = false;
                    console.log('Sending gauge reset request ');
                    this.setGaugeStatus('Sending reset command to gauge. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this.gTx.sendEncodedCmd(this.gTx.encodeCmd(this.gTx._cmdList.Reset));
                break;
    
                case '2':  
                    console.log('Disabling sending of gauge value during adminstration.');
                    this._okToSend = false;  
                    console.log('Sending gauge Zero Needle request ');
                    this.setGaugeStatus('Sending zero needle command to gauge. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this.gTx.sendEncodedCmd(this.gTx.encodeCmd(this.gTx._cmdList.Zero_Needle));
                break;          
        
                case '3':  
                    console.log('Disabling sending of gauge value during adminstration.');
                    this._okToSend = false;
                    console.log('Sending Identifify gauge request')
                    this.setGaugeStatus('Sending identifify command to gauge. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this.gTx.sendEncodedCmd(this.gTx.encodeCmd(this.gTx._cmdList.Identifify));
                break;
    
                case '4': 
                    console.log('Disable normal gauge value TX during adminstration.')
                    this.setGaugeStatus('Disable normal gauge value transmission during adminstration. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this._okToSend = false;
                    this.gTx.sendEncodedCmd(0);
                break;
        
                case '5':    
                    console.log('Enable normal gauge value TX.')
                    this.setGaugeStatus('Enabling normal gauge value transmission. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this._okToSend = true;
                break;

                case '6':    
                    console.log('Resetting gauge configuration to default.')
                    if (fs.existsSync(this.modifiedConfigFilePath)){
                        console.log('Removing custom configuration file' + this.modifiedConfigFilePath);
                        this.setGaugeStatus('Removing custom configuration file and resetting gauge to default config. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                        fs.unlinkSync(this.modifiedConfigFilePath);
                        this._reloadConfig();
                    } else {
                        console.log('Warning: Custom configuration file not found.');
                        cmdResult='Warning: Custom configuration file not found.'
                    };                   
                break;

                case "10":
                    console.log('Enable normal gauge value TX.')
                    this._okToSend = true;
                    console.log("Send the value zero to gauge and enabling normal gauge TX.")
                    this.setGaugeValue(0)
                break;
                    
                case "20":   
                    console.log('Test: Flag Alert to rgMan');
                    this.sendAlert({[this.config.descripition]:"1"});
                break;

                case "21":  
                    console.log('test: Clear Alert to rgMan');
                    this.sendAlert({[this.config.descripition]:"0"});
                break;
            
                default:
                    console.log('no case for ' + cmdNum);
                    cmdResult='Warning: no case or action for this command.'
                break;
            };
            this.gaugeCommand.setValue('Last command num = ' + cmdNum + ', result = ' + cmdResult + ', at ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
        });   
        
        this.appVer.on('ReadValue', (device) =>{
            console.log(device + ' requesting app version')
            this.appVer.setValue((JSON.parse(fs.readFileSync('package.json'))).version);
        })
        
        console.log('setting default characteristic values...');
        this.gaugeValue.setValue(this.value);
        this.gaugeStatus.setValue(this.status)
        this.gaugeConfig.setValue(JSON.stringify(this.config));
    };
};

function getDataEncryptionKey(){
    console.log('appManagerClass is asking rgMan for data encryption key status.')
    var result = cp.execSync("/usr/bin/dbus-send --system --dest=com.rgMan --print-reply=literal /com/rgMan/cipherStatus org.bluez.GattCharacteristic1.ReadValue");
    
    if(result == 'Key is available'){
        console.log('appManagerClass is reading encrytion key from rgMan');
        encrytionKey = cp.execSync("/usr/bin/dbus-send --system --dest=com.rgMan --print-reply=literal /com/rgMan/cipherKey org.bluez.GattCharacteristic1.ReadValue");
        console.log('key = ' + encrytionKey);
        return true;
    } else {
        console.log('Encrytion key not available, status = ' + result);
    };
    return false;
};

module.exports = appManager;
