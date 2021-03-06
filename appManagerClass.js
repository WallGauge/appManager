const fs = require("fs");
const cp = require('child_process');
const EventEmitter = require('events');
const irTransmitter = require('irdtxclass');
const BLEperipheral = require("ble-peripheral");
const Crypto = require("cipher").encryption;
const GdtManCom = require('./gdtManCom.js');

const logPrefix = 'appManagerClass.js | ';

var self;
var crypto = {};
var encryptionKey = null

class appManager extends EventEmitter {
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
    constructor(defaultGaugeConfigPath = __dirname + '/gaugeConfig.json', modifiedConfigMasterPath = __dirname + '/modifiedConfig.json', encryptMyDataOnDisk = false, dataEncryptionKey = null) {
        super();
        this.subscriptionExpired = false;
        this.encryptMyData = encryptMyDataOnDisk;
        this.encryptionAvailable = false;
        if (this.encryptMyData && dataEncryptionKey != null) {
            this.encryptionAvailable = true;
            encryptionKey = dataEncryptionKey;
        };
        if (this.encryptionAvailable) {
            logit('appManagerClass has a data encryption key. Setting up encryption...');
            crypto = new Crypto(encryptionKey);
        };
        this.defaultConfigFilepath = defaultGaugeConfigPath;
        this.defaultConfigMaster = {};
        if (fs.existsSync(this.defaultConfigFilepath)) {
            this.defaultConfigMaster = JSON.parse(fs.readFileSync(this.defaultConfigFilepath))
        } else {
            console.error('Error Config file located at ' + this.defaultConfigFilepath + ', not found!');
            console.error('From:' + __filename);
            throw new Error('Default Config File not found.');
        };
        this.modifiedConfigFilePath = modifiedConfigMasterPath;
        this.modifiedConfigMaster = {};
        if (fs.existsSync(this.modifiedConfigFilePath)) {
            if (this.encryptMyData) {
                this.modifiedConfigMaster = this._readEncryptedJsonFile(this.modifiedConfigFilePath);
                this.emit('configReady');
            } else {
                this.modifiedConfigMaster = JSON.parse(fs.readFileSync(this.modifiedConfigFilePath))
                this.emit('configReady');
            };
        } else {
            this.emit('configReady');
        };

        this.config = { ...this.defaultConfigMaster, ...this.modifiedConfigMaster };
        this.status = 'ipl, ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString();
        this.value = 'Not Set Yet';
        this._okToSend = true;
        this.gTx = new irTransmitter(this.config.gaugeIrAddress, this.config.calibrationTable);
        this.bPrl = new BLEperipheral(this.config.dBusName, this.config.uuid, this._bleConfig, false);

        this.bPrl.gattService.on('regComplete', () => {
            logit('BLE init complete. Setting up dBus communications with gdtMan....')
            this.gdtManCom = new GdtManCom(this.bPrl.dBusClient);
            this.gdtManCom.on('iFaceReady', () => {
                logit('dBus communications with gdtMan is ready.  Reading subscription expired value...');
                this.gdtManCom.getProperty('SubscriptionExpired')
                    .then((val) => {
                        logit('This gdts subscription expired value = ' + val);
                        this.subscriptionExpired = val;
                    })
                    .catch((err) => {
                        logit('Error with this.gdtManCom.getProperty call: ' + err)
                    });
            });
            this.gdtManCom.on('SubExpired', (value) => {
                logit('A subscription expired event has been received from gdtMan: SubExpired = ' + value);
                this.subscriptionExpired = value;
            });
        });

        self = this;
        this.bPrl.on('ConnectionChange', (connected) => {
            var bleUserName = '';
            if (this.bPrl.client.name == '') {
                bleUserName = this.bPrl.client.devicePath;
            } else {
                bleUserName = this.bPrl.client.name;
            };
            if (connected == true) {
                logit('--> ' + bleUserName + ' has connected to this server at ' + (new Date()).toLocaleTimeString());
                if (this.bPrl.client.paired == false) {
                    logit('--> CAUTION: This BLE device is not authenticated.');
                }
            } else {
                logit('<-- ' + bleUserName + ' has disconnected from this server at ' + (new Date()).toLocaleTimeString());
                if (this.bPrl.areAnyCharacteristicsNotifying() == true) {
                    logit('Stopping leftover notifications...')
                    this.bPrl.clearAllNotifications();
                };
            };
        });
    };

    /** Transmits gauge vlaue to irTxServer, also sets BLE gauge vlaue and fires BLE notify
     * 
     * @param {*} value is the gauge value
     * @param {string} descripition is an optional description of value
     */
    setGaugeValue(value, descripition = '') {
        if (this._okToSend) {
            if (this.subscriptionExpired == true) {
                this.setGaugeStatus('Alert: This GDTs Subscription has expired.');
                this.gTx.setSubscriptionExpired()
            } else {
                this.gTx.sendValue(value);
            }
        } else {
            this.setGaugeStatus('Warining: Gauge value transmission not allowed during adminstration.')
            return false;
        };


        var logValue = value.toString() + ', ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString();
        if (descripition != '') {
            logValue = value.toString() + descripition.toString();
        };

        this.value = logValue;
        this.gaugeValue.setValue(logValue);

        if (this.gaugeValue.iface.Notifying) {
            this.gaugeValue.notify();
        };
        return true;
    };

    /** Sets BLE gaugeStatus and fires BLE notify
     * 
     * @param {string} statusStr status string to set. Suggest including a time stamp in the string for exampel 'Okay, 8:14:25AM, 2/10/2019'
     */
    setGaugeStatus(statusStr) {
        if (this.subscriptionExpired == true) {
            this.status = 'Alert: This GDTs Subscription has expired.';
        } else {
            this.status = statusStr;
        };
        this.gaugeStatus.setValue(this.status);
        if (this.gaugeStatus.iface.Notifying) {
            this.gaugeStatus.notify();
        };
    };

    sendAlert(objectToSend = { 'this.config.descripition': "1" }) {
        try {
            this.gdtManCom.sendAlert(objectToSend);
        } catch (err) {
            console.error('Error when trying to sendAlert to gdtMan ', err);
        };
    };

    /** This is a blank method that can be extended. 
     * This method will be called after _bleMasterConfig() allowing custom characteristics to be added.
     */
    bleMyConfig() {
        logit('bleMyConfig not extended, there will not be any unique app characteristics set.  Using defaults only.');
    };

    /** Saves custom config items to the config file located in modifiedConfigMasterPath 
     * Item to be saved should be in key:value format.  For example to seave the IP address of a device call this method with
     * saveItem({webBoxIP:'10.10.10.12});
     * @param {Object} itemsToSaveAsObject 
     */
    saveItem(itemsToSaveAsObject) {
        logit('saveItem called with:');
        // if(!this.encryptMyData)logit(itemsToSaveAsObject);
        var itemList = Object.keys(itemsToSaveAsObject);
        itemList.forEach((keyName) => {
            this.modifiedConfigMaster[keyName] = itemsToSaveAsObject[keyName];
        });
        if (this.encryptMyData) {
            this._writeJsonToEncryptedFile(this.modifiedConfigFilePath, this.modifiedConfigMaster)
        } else {
            logit('Writting file (not using encryption) to ' + this.modifiedConfigFilePath);
            fs.writeFileSync(this.modifiedConfigFilePath, JSON.stringify(this.modifiedConfigMaster));
        };
        this._reloadConfig();
    };

    _reloadConfig() {
        logit('config reloading...');
        this.modifiedConfigMaster = {};
        if (fs.existsSync(this.modifiedConfigFilePath)) {
            if (this.encryptMyData) {
                this.modifiedConfigMaster = this._readEncryptedJsonFile(this.modifiedConfigFilePath);
            } else {
                this.modifiedConfigMaster = JSON.parse(fs.readFileSync(this.modifiedConfigFilePath))
            };
        };
        this.config = { ...this.defaultConfigMaster, ...this.modifiedConfigMaster };
        var cleanCfgObg = {
            descripition: this.config.descripition,
            uuid: this.config.uuid
        };
        this.gaugeConfig.setValue(JSON.stringify(cleanCfgObg));
        logit('firing "Update" event...');
        this.emit('Update');
    };

    _readEncryptedJsonFile(jsonFilePath) {
        logit('appManagerClass is reading and decrypting ' + jsonFilePath);
        if (this.encryptionAvailable) {
            var encryptedFileContents = fs.readFileSync(jsonFilePath, 'utf8');
            var decryptedFileContents = crypto.decrypt(encryptedFileContents);
            return JSON.parse(decryptedFileContents);
        } else {
            console.error('ERROR Call to appManagerClass readEncryptedJsonFile method but encryption is not available.')
            throw Error('Call to appManagerClass readEncryptedJsonFile method but encryption is not available.');
        };
    };

    _writeJsonToEncryptedFile(filePath, jsonObj) {
        logit('appManagerClass is encrypting and saving JSON Object to ' + filePath);
        if (this.encryptionAvailable) {
            var encryptedFileBuffer = crypto.encrypt(JSON.stringify(jsonObj));
            fs.writeFileSync(filePath, encryptedFileBuffer);
        } else {
            console.error('ERROR Call to appManagerClass writeJsonToEncryptedFile method but encryption is not available.')
            throw Error('Call to appManagerClass writeJsonToEncryptedFile method but encryption is not available.');
        };
    };

    _bleConfig(DBus) {
        self._bleMasterConfig();
        self.bleMyConfig();
    };

    _bleMasterConfig() {
        //this.bPrl.logCharacteristicsIO = true;
        //this.bPrl.logAllDBusMessages = true;
        logit('Initialize charcteristics...')
        this.appVer = this.bPrl.Characteristic('001d6a44-2551-4342-83c9-c18a16a3afa5', 'appVer', ["encrypt-read"]);
        this.gaugeStatus = this.bPrl.Characteristic('002d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeStatus', ["encrypt-read", "notify"]);
        this.gaugeValue = this.bPrl.Characteristic('003d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeValue', ["encrypt-read", "notify"]);
        this.gaugeCommand = this.bPrl.Characteristic('004d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeCommand', ["encrypt-read", "encrypt-write"]);
        this.gaugeConfig = this.bPrl.Characteristic('005d6a44-2551-4342-83c9-c18a16a3afa5', 'gaugeConfig', ["encrypt-read"]);
        this.battLifeInDays = this.bPrl.Characteristic('90a5cca6-36f3-4a02-b02d-348921c50fd8', 'battLifeInDays', ["encrypt-read"]);
        this.battLastReplaced = this.bPrl.Characteristic('6b52b1c4-9b30-4851-84f8-b48d27b730a3', 'battLastReplaced', ["encrypt-read", "encrypt-write"]);
        this.gaugeURL = this.bPrl.Characteristic('52261f60-c6a0-4ca9-93ba-c0ea76a842af', 'gaugeURL', ["encrypt-read"]);

        logit('Registering event handlers...');
        this.gaugeCommand.on('WriteValue', (device, arg1) => {
            var cmdNum = arg1.toString()
            //var cmdValue = arg1[1]
            var cmdResult = 'okay';
            logit(device + ' has sent a new gauge command: number = ' + cmdNum);

            switch (cmdNum) {
                case '0':
                    logit('Sending test battery to gauge...');
                    logit('Disabling sending of gauge value during adminstration.');
                    this._okToSend = false;
                    this.setGaugeStatus('Sending test battery command to gauge. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this.gTx.sendEncodedCmd(this.gTx.encodeCmd(this.gTx._cmdList.Check_Battery_Voltage));
                    break;

                case '1':
                    logit('Disabling sending of gauge value during adminstration.');
                    this._okToSend = false;
                    logit('Sending gauge reset request ');
                    this.setGaugeStatus('Sending reset command to gauge. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this.gTx.sendEncodedCmd(this.gTx.encodeCmd(this.gTx._cmdList.Reset));
                    break;

                case '2':
                    logit('Disabling sending of gauge value during adminstration.');
                    this._okToSend = false;
                    logit('Sending gauge Zero Needle request ');
                    this.setGaugeStatus('Sending zero needle command to gauge. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this.gTx.sendEncodedCmd(this.gTx.encodeCmd(this.gTx._cmdList.Zero_Needle));
                    break;

                case '3':
                    logit('Disabling sending of gauge value during adminstration.');
                    this._okToSend = false;
                    logit('Sending Identifify gauge request')
                    this.setGaugeStatus('Sending identifify command to gauge. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this.gTx.sendEncodedCmd(this.gTx.encodeCmd(this.gTx._cmdList.Identifify));
                    break;

                case '4':
                    logit('Disable normal gauge value TX during adminstration.')
                    this.setGaugeStatus('Disable normal gauge value transmission during adminstration. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this._okToSend = false;
                    this.gTx.sendEncodedCmd(0);
                    break;

                case '5':
                    logit('Enable normal gauge value TX.')
                    this.setGaugeStatus('Enabling normal gauge value transmission. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                    this._okToSend = true;
                    break;

                case '6':
                    logit('Resetting gauge configuration to default.')
                    if (fs.existsSync(this.modifiedConfigFilePath)) {
                        logit('Removing custom configuration file' + this.modifiedConfigFilePath);
                        this.setGaugeStatus('Removing custom configuration file and resetting gauge to default config. ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
                        fs.unlinkSync(this.modifiedConfigFilePath);
                        this._reloadConfig();
                    } else {
                        logit('Warning: Custom configuration file not found.');
                        cmdResult = 'Warning: Custom configuration file not found.'
                    };
                    break;

                case "10":
                    logit('Enable normal gauge value TX.')
                    this._okToSend = true;
                    logit("Send the value zero to gauge and enabling normal gauge TX.")
                    this.setGaugeValue(0)
                    break;

                case "20":
                    logit('Test: Flag Alert to gdtMan');
                    this.sendAlert({ [this.config.descripition]: "1" });
                    break;

                case "21":
                    logit('test: Clear Alert to gdtMan');
                    this.sendAlert({ [this.config.descripition]: "0" });
                    break;

                default:
                    logit('no case for ' + cmdNum);
                    cmdResult = 'Warning: no case or action for this command.'
                    break;
            };
            this.gaugeCommand.setValue('Last command num = ' + cmdNum + ', result = ' + cmdResult + ', at ' + (new Date()).toLocaleTimeString() + ', ' + (new Date()).toLocaleDateString());
        });

        this.appVer.on('ReadValue', (device) => {
            logit(device + ' requesting app version')
            var version = (JSON.parse(fs.readFileSync('package.json'))).version
            version = version + getBranch('./');
            // this.appVer.setValue((JSON.parse(fs.readFileSync('package.json'))).version);
            this.appVer.setValue(version);
        })
        this.battLastReplaced.on('WriteValue', (device, arg1) => {
            logit(device + ', has set new battLastReplaced.');
            this.battLastReplaced.setValue(arg1);
            var x = arg1.toString('utf8');
            this.saveItem({ battLastReplaced: x });        //this will add {varName : Value} to this.config.  In this case to access the battLastReplaced use this.config.battLastReplaced
        });

        logit('setting default characteristic values...');
        this.gaugeValue.setValue(this.value);
        this.gaugeStatus.setValue(this.status)
        var cleanCfgObg = {
            descripition: this.config.descripition,
            uuid: this.config.uuid
        };
        this.gaugeConfig.setValue(JSON.stringify(cleanCfgObg));

        if ('battLifeInDays' in this.config) {
            this.battLifeInDays.setValue(this.config.battLifeInDays);
        } else {
            console.warn('appManager Alert: This gauges config is missing battLifeInDays key:value.');
        };

        if ('gaugeURL' in this.config) {
            this.gaugeURL.setValue(this.config.gaugeURL);
        } else {
            console.warn('appManager Alert: This gauges config is missing gaugeURL key:value.');
        };


        if ('battLastReplaced' in this.config) {
            if (this.config.battLastReplaced == '') {
                logit('Setting today as battery last replaced date.');
                var batReplacedOn = (new Date()).toISOString();
                this.saveItem({ battLastReplaced: batReplacedOn });
                this.battLastReplaced.setValue(batReplacedOn);
            } else {
                this.battLastReplaced.setValue(this.config.battLastReplaced);
            };
        } else {
            console.warn('appManager Alert: This gauges config is missing battLastReplaced key:value.');
        };
    };
};

function getBranch(appDir = '/opt/rGauge/gdtMan') {
    var returnStr = "";
    var resultStr = cp.execSync('/usr/bin/git branch', { cwd: appDir });
    resultArry = (resultStr.toString()).split(" ");
    resultArry.forEach((val, index) => {
        if (val == '*') {
            returnStr = (resultArry[index + 1]).trim();
        };
    });
    if (returnStr == 'master') {
        return '';
    } else {
        logit(appDir + ' is using the ' + returnStr + ' branch.');
        return (' ' + returnStr);
    };
};

/**
 * Returns a buffer that repersents an array of bytes returned from a dbus-send command.
 * 
 * @param {*} keyAsString keyAsString -->array of bytes [6b 4e 4c bb a3 3a 01 77 a1 8d 47 2c 88 c9 65 22 db 01 fe c5 90 7b 7b fc a5 c7 7c 52 0e f8 63 0f ]<--
 */
function parseKey(keyAsString) {
    var x = keyAsString.split('[');
    x = x[1].split(']');
    x[0] = x[0].trim();
    var valueAsArry = x[0].split(' ');
    valueAsArry.forEach((item, indx) => {
        valueAsArry[indx] = '0x' + item
    });
    return Buffer.from(valueAsArry, 'hex');
};

/**
 * Returns a string that repersents a string value returned from a dbus-send command.
 * 
 * @param {*} valueAsString = ->    array of bytes "Key is available"<-
 */
function parseText(valueAsString) {
    var x = valueAsString.split('"');
    return x[1];
};

module.exports = appManager;


function logit(txt = '') {
    console.debug(logPrefix + txt)
};