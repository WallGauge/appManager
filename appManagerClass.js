const fs =              require("fs");
const cp =              require('child_process');
const EventEmitter =    require('events');
const irTransmitter =   require('irdtxclass');
const BLEperipheral =   require("ble-peripheral");
const Crypto =          require("cipher").encryption;

var self;
var crypto = {};
var encryptionKey = null

/**
 * This class provides an interface to the gauge’s factory default configuration settings. Typically, these settings are stored in a file called gaugeConfig.json, with user modifications to the factory defaults in a file called modifiedConfig.json. 
 * This class also provides a frontend to the irdTxClass and  blePeripheral class in the setGaugeStatus and setGaugeValue methods.
 * Version 1.4.x supports encryption of the modifiedConfig.json file.  This will encrypte the file contents based on an encrytion key passed during construction. 
 * To require encryption set encryptMyDataOnDisk = true.  If this is true and the encryption key is not available this class will throw.
 * 
 * Emits:
 *  emit('Update'); when the configuration file has been changed and reloaded
 *  emit('configReady'); when the config file has been loaded and decrypted.
 * 
 * ** * gaugConfig.json must have key fields such as UUID and dBusName and conform to a JSON format.  See the README.md for details or the smaple file located in ./samples/sample_gaugeConfig.json **
 * 
 * typical setup call ->const myAppMan = new AppMan(__dirname + '/gaugeConfig.json', __dirname + '/modifiedConfig.json');<-
 * 
 * @param {string} defaultGaugeConfigPath gaugeConfig.json location. Example: (__dirname + '/gaugeConfig.json'). This file must exist see ./samples/sample_gaugeConfig.json for an example format
 * @param {string} modifiedConfigMasterPath modifiedConfig.json location. Example: (__dirname + '/modifiedConfig.json'). This file will be created on first write if it doesn't exist. 
 * @param {bool} encryptMyDataOnDisk defaults to false.  Set to true if you want to encrypte the contents of modifiedConfigMasterPath file.  
 * @param {string} dataEncryptionKey defaults to null. Pass the encryption key to use to encrypt and decrypt modifiedConfig.json file.
 */
class appManager extends EventEmitter{
    constructor(defaultGaugeConfigPath = '', modifiedConfigMasterPath = '', encryptMyDataOnDisk = false, dataEncryptionKey = null){
        super();
        this.encryptMyData = encryptMyDataOnDisk;
        this.encryptionAvailable = false;
        if(this.encryptMyData && dataEncryptionKey != null){
            this.encryptionAvailable = true;
            encryptionKey = dataEncryptionKey;
        };
        if(this.encryptionAvailable){
            console.log('appManagerClass has a data encryption key. Setting up encryption...');
            crypto = new Crypto(encryptionKey);
        };
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
        if (fs.existsSync(this.modifiedConfigFilePath)){
            if(this.encryptMyData){
                this.modifiedConfigMaster = this._readEncryptedJsonFile(this.modifiedConfigFilePath);
                this.emit('configReady');
            }  else {
                this.modifiedConfigMaster = JSON.parse(fs.readFileSync(this.modifiedConfigFilePath))
                this.emit('configReady');
            };
        } else {
            this.emit('configReady');
        };

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
        var asArry = JSON.stringify(objectToSend).split('');
        var nums = '[';
        asArry.forEach((val, indx)=>{
            nums += '0x' + val.charCodeAt().toString(16);
            if(indx + 1 != asArry.length){nums += ','};
        })
        nums += ']';
        console.log('Calling gdbus to send alert to rgMan...');
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
        if(!this.encryptMyData)console.log(itemsToSaveAsObject);
    
        var itemList = Object.keys(itemsToSaveAsObject);
        itemList.forEach((keyName)=>{
            this.modifiedConfigMaster[keyName] = itemsToSaveAsObject[keyName];
        });
        if(this.encryptMyData){
            this._writeJsonToEncryptedFile(this.modifiedConfigFilePath, this.modifiedConfigMaster)
        } else {
            console.log('Writting file (not using encryption) to ' + this.modifiedConfigFilePath);
            fs.writeFileSync(this.modifiedConfigFilePath, JSON.stringify(this.modifiedConfigMaster));
        };
        this._reloadConfig();
    };

    _reloadConfig(){
        console.log('config reloading...');
        this.modifiedConfigMaster = {};
        if (fs.existsSync(this.modifiedConfigFilePath)){
            if(this.encryptMyData){
                this.modifiedConfigMaster = this._readEncryptedJsonFile(this.modifiedConfigFilePath);
            }  else {
                this.modifiedConfigMaster = JSON.parse(fs.readFileSync(this.modifiedConfigFilePath))
            };
        };
        this.config = {...this.defaultConfigMaster, ...this.modifiedConfigMaster};
        this.gaugeConfig.setValue(JSON.stringify(this.config));
        console.log('firing "Update" event...');
        this.emit('Update');
    };

    _readEncryptedJsonFile(jsonFilePath){
        console.log('appManagerClass is reading and decrypting ' + jsonFilePath);
        if(this.encryptionAvailable){
            var encryptedFileContents = fs.readFileSync(jsonFilePath, 'utf8');
            var decryptedFileContents = crypto.decrypt(encryptedFileContents);
            return JSON.parse(decryptedFileContents);
        } else {
            console.log('ERROR Call to appManagerClass readEncryptedJsonFile method but encryption is not available.')
            throw Error ('Call to appManagerClass readEncryptedJsonFile method but encryption is not available.');
        };
    };
    
    _writeJsonToEncryptedFile(filePath, jsonObj){
        console.log('appManagerClass is encrypting and saving JSON Object to ' + filePath);
        if(this.encryptionAvailable){
            var encryptedFileBuffer = crypto.encrypt(JSON.stringify(jsonObj));
            fs.writeFileSync(filePath, encryptedFileBuffer);
        } else {
            console.log('ERROR Call to appManagerClass writeJsonToEncryptedFile method but encryption is not available.')
            throw Error ('Call to appManagerClass writeJsonToEncryptedFile method but encryption is not available.');
        };
    };

    _bleConfig(DBus){
        self._bleMasterConfig();
        self.bleMyConfig();
    };

    _bleMasterConfig(){
        //this.bPrl.logCharacteristicsIO = true;
        //this.bPrl.logAllDBusMessages = true;
        console.log('Initialize charcteristics...')
        this.appVer =           this.bPrl.Characteristic('001d6a44-2551-4342-83c9-c18a16a3afa5', 'appVer', ["encrypt-read"]);
        this.gaugeStatus =      this.bPrl.Characteristic('002d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeStatus', ["encrypt-read","notify"]);
        this.gaugeValue =       this.bPrl.Characteristic('003d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeValue', ["encrypt-read","notify"]);
        this.gaugeCommand =     this.bPrl.Characteristic('004d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeCommand', ["encrypt-read","encrypt-write"]);
        this.gaugeConfig =      this.bPrl.Characteristic('005d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeConfig', ["encrypt-read"]);
        this.battLifeInDays =   this.bPrl.Characteristic('90a5cca6-36f3-4a02-b02d-348921c50fd8', 'battLifeInDays', ["encrypt-read"]);
    
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
        var cleanCfgObg = {
            descripition : this.config.descripition,
            uuid : this.config.uuid
        };
        this.gaugeConfig.setValue(JSON.stringify(cleanCfgObg));
        if(this.config.battLifeInDays){
            this.battLifeInDays.setValue(this.config.battLifeInDays);
        }
    };
};

/**
 * Returns a buffer that repersents an array of bytes returned from a dbus-send command.
 * 
 * @param {*} keyAsString keyAsString -->array of bytes [6b 4e 4c bb a3 3a 01 77 a1 8d 47 2c 88 c9 65 22 db 01 fe c5 90 7b 7b fc a5 c7 7c 52 0e f8 63 0f ]<--
 */
function parseKey(keyAsString){
    var x = keyAsString.split('[');
    x = x[1].split(']');
    x[0] = x[0].trim();
    var valueAsArry = x[0].split(' ');
    valueAsArry.forEach((item, indx) => {
        valueAsArry[indx] = '0x'+item
    });
    return Buffer.from(valueAsArry, 'hex');
};

/**
 * Returns a string that repersents a string value returned from a dbus-send command.
 * 
 * @param {*} valueAsString = ->    array of bytes "Key is available"<-
 */
function parseText(valueAsString){
    var x = valueAsString.split('"');
    return x[1];
};



module.exports = appManager;
