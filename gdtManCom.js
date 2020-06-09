const logPrefix = 'appManagerClass_gdtManCom.js | ';

class gdtManCom {
    /**
     * This class communicates with gdtMan over dbus.  Its primary goal is to realy alerts if this gauge is in error 
     * and to let the user know their subscription has expired
     * 
     * @param {object} DBusClient Is a dbus system object
     */
    constructor(DBusClient) {
        this._DBusClient = DBusClient;
    };

    /**
     * Sends an alert to gdtMan over dBus using the gdtMan/gaugeAlert characteristic
     * gdbus call --system --dest com.gdtMan --object-path /com/gdtMan --method org.freedesktop.DBus.Properties.GetAll gdtMan.gaugeCom
     * @param {object} objectToSend 
     */
    sendAlert(objectToSend = { 'this.config.descripition': "1" }) {
        var objectPath = '/com/gdtMan'
        var jString = JSON.stringify(objectToSend);
        logit('Sending alert to gdtMan: ' + jString);

        this._DBusClient.getInterface('com.gdtMan', objectPath, 'gdtMan.gaugeCom', (err, iface) => {
            if (err) {
                logit("Error with interface to 'com.gdtMan', " + objectPath + ", 'gdtMan.gaugeCom'");
                console.error('Failed to request interface ', err);
            } else {
                iface.Alert(jString, (err, result) => {
                    if (err) {
                        logit('Error calling sendAlert. ObjectPath = ' + objectPath);
                        console.error('Error calling sendAlert.', err);
                    };
                    if (result) {
                        logit('Result from sendAlert = ' + result);
                    };
                });
            };
        });
    };

    /**
     * reads a property from gdtMan
     * @param {string} propertyName 
     * @returns promise (value)
     */
    getProperty(propertyName = 'SubscriptionExpired'){
        var objectPath = '/com/gdtMan'
        return new Promise((reslove, reject) => {
            this._DBusClient.getInterface('com.gdtMan', objectPath, 'gdtMan.gaugeCom', (err, iface) => {
                if (err) {
                    logit('Error getting interface to com.gdtMan to getProperty');
                    console.error('Error getting interface', err);
                    reject(err);
                } else {
                    iface.getProperty(propertyName, (err, value) => {
                        if(err){
                            logit('Error reading property ' + propertyName);
                            console.error('Error getProperty',err);
                            reject(err);
                        } else {
                            reslove(value);
                        };
                    });
                };
            });
        });
    };
};

function logit(txt = '') {
    console.debug(logPrefix + txt);
};

module.exports = gdtManCom;

