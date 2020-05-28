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
     * 
     * @param {object} objectToSend 
     */
    sendAlert(objectToSend = { 'this.config.descripition': "1" }) {
        var objectPath = '/com/gdtMan/gaugeAlert'
        logit('Sending alert to gdtMan...');
        var asArry = JSON.stringify(objectToSend);
        logit(asArry);

        // var options = {
        //     'optionList':
        //     {
        //         'ListItem1': '123',
        //         'ListItem2': '456',
        //     }
        // };

        var options = 
            {
                'ListItem1': '123',
                'ListItem2': '456',
            };



        this._DBusClient.getInterface('com.gdtMan', objectPath, 'org.bluez.GattCharacteristic1', (err, iface) => {
            if (err) {
                logit("Error with interface to 'com.gdtMan', " + objectPath + ", 'org.bluez.GattCharacteristic1'");
                console.error('Failed to request interface ', err);
            } else {
                // iface.WriteValue(asArry, {"device":"sbPowerGauge"}, (err, result) => {
                //     if (err) {
                //         logit('Error calling sendAlert. ObjectPath = ' + objectPath);
                //         console.error('Error calling sendAlert.', err);
                //     };
                //     if (result) {
                //         logit('Result from sendAlert = ' + result);
                //     };
                // });
                logit('using options...');
                iface.ReadValue(options, (err, result) => {
                    if (err) {
                        logit('Error calling sendAlert ReadValue. ObjectPath = ' + objectPath);
                        console.error('Error calling sendAlert ReadValue.', err);
                    };
                    if (result) {
                        logit('Result from sendAlert = ' + result);
                    };
                });
            };
        });

        // this._DBusClient.getInterface('com.gdtMan', objectPath, 'org.freedesktop.DBus.Properties', (err, iface) => {
        //     if (err) {
        //         logit("Error with interface to 'com.gdtMan', " + objectPath + ", 'org.freedesktop.DBus.Properties'");
        //         console.error('Failed to request interface ', err);
        //     } else {
        //         // iface.WriteValue(asArry, {"device":"sbPowerGauge"}, (err, result) => {
        //         //     if (err) {
        //         //         logit('Error calling sendAlert. ObjectPath = ' + objectPath);
        //         //         console.error('Error calling sendAlert.', err);
        //         //     };
        //         //     if (result) {
        //         //         logit('Result from sendAlert = ' + result);
        //         //     };
        //         // });
        //         logit('using options...');
        //         iface.GetAll('org.bluez.GattCharacteristic1', (err, result) => {
        //             if (err) {
        //                 logit('Error calling get all properties. ObjectPath = ' + objectPath);
        //                 console.error('Error calling sendAlert ReadValue.', err);
        //             };
        //             if (result) {
        //                 logit('Result from getall properties = ' + result);
        //                 console.dir(result, {depth:null});
        //             };
        //         });
        //     };
        // });
    };

};

function logit(txt = '') {
    console.debug(logPrefix + txt);
};

module.exports = gdtManCom;

