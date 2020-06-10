const EventEmitter = require('events');
const logPrefix = 'appManagerClass.js | gdtManCom.js | ';

class gdtManCom extends EventEmitter {
    /**
     * This class communicates with gdtMan over dbus.  Its primary goal is to realy alerts if this gauge is in error 
     * and to let the user know their subscription has expired
     * 
     * @param {object} DBusClient Is a dbus system object
     */
    constructor(DBusClient) {
        super();
        this._DBusClient = DBusClient;
        this._iFace = {}
        this._DBusClient.getInterface('com.gdtMan', '/com/gdtMan', 'com.gdtMan.gaugeCom', (err, iface) => {
            if (err) {
                logit("Error with interface to 'com.gdtMan' durning class construction...");
                console.error('Failed to request interface ', err);
            } else {
                logit('Setting up event emitter for SubExpired on new interface');
                this._iFace = iface;
                this._iFace.on('SubExpired', (status) => {
                    logit('SubExpired event firing, value = ' + status);
                    this.emit('SubExpired', status);
                });
            };
        });
    };

    /**
     * Sends an alert to gdtMan over dBus using the gdtMan/gaugeAlert characteristic
     * gdbus call --system --dest com.gdtMan --object-path /com/gdtMan --method org.freedesktop.DBus.Properties.GetAll com.gdtMan.gaugeCom
     * @param {object} objectToSend 
     */
    sendAlert(objectToSend = { 'this.config.descripition': "1" }) {
        var objectPath = '/com/gdtMan'
        var jString = JSON.stringify(objectToSend);
        logit('Sending alert to gdtMan: ' + jString);
        if (isEmpty(this._iFace)) {
            logit('Error this dbus interface object not setup. Skipping this command.');
            return;
        };
        this._iFace.Alert(jString, (err, result) => {
            if (err) {
                logit('Error calling sendAlert. ObjectPath = ' + objectPath);
                console.error('Error calling sendAlert.', err);
            };
            if (result) {
                logit('Result from sendAlert = ' + result);
            };
        });

        // this._DBusClient.getInterface('com.gdtMan', objectPath, 'com.gdtMan.gaugeCom', (err, iface) => {
        //     if (err) {
        //         logit("Error with interface to 'com.gdtMan', " + objectPath + ", 'com.gdtMan.gaugeCom'");
        //         console.error('Failed to request interface ', err);
        //     } else {
        //         iface.Alert(jString, (err, result) => {
        //             if (err) {
        //                 logit('Error calling sendAlert. ObjectPath = ' + objectPath);
        //                 console.error('Error calling sendAlert.', err);
        //             };
        //             if (result) {
        //                 logit('Result from sendAlert = ' + result);
        //             };
        //         });
        //     };
        // });
    };

    /**
     * reads a property from gdtMan
     * @param {string} propertyName 
     * @returns promise (value)
     */
    getProperty(propertyName = 'SubscriptionExpired') {
        return new Promise((resolve, reject) => {
            if (isEmpty(this._iFace)) {
                logit('Error this dbus interface object not setup. Rejecting getProperty command.');
                reject('Error this dbus interface object not setup.');
            };
            this._iFace.getProperty(propertyName, (err, value) => {
                if (err) {
                    logit('Error reading property ' + propertyName);
                    console.error('Error getProperty', err);
                    reject(err);
                } else {
                    reslove(value);
                };
            });
        });

        // return new Promise((reslove, reject) => {
        //     this._DBusClient.getInterface('com.gdtMan', objectPath, 'com.gdtMan.gaugeCom', (err, iface) => {
        //         if (err) {
        //             logit('Error getting interface to com.gdtMan to getProperty');
        //             console.error('Error getting interface', err);
        //             reject(err);
        //         } else {
        //             iface.getProperty(propertyName, (err, value) => {
        //                 if (err) {
        //                     logit('Error reading property ' + propertyName);
        //                     console.error('Error getProperty', err);
        //                     reject(err);
        //                 } else {
        //                     reslove(value);
        //                 };
        //             });
        //         };
        //     });
        // });
    };
};

function isEmpty(obj) {
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            return false;
        }
    }
    return true;
}

function logit(txt = '') {
    console.debug(logPrefix + txt);
};

module.exports = gdtManCom;

