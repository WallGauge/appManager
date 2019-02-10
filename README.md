# appManager
Application Manger class that manages a gauge's configuration files and provides an interface to the BLE and irdTxServer classes.

 * This class provides an interface to the gauge’s factory default configuration settings. Typically, these settings are stored in a file called gaugeConfig.json, with user modifications to the factory defaults in a file called modifiedConfig.json. 
 * This class also provides a frontend to the irdTxClass and  blePeripheral class in the setGaugeStatus and setGaugeValue methods.
 * gaugConfig.json must have key fields such as UUID and dBusName see the sample_gaugeConfig.json file in the ./samples directory for details.
 
 A new file will be created when an application needs to change the default settings or add additional settings.   All modifications both to the factory defaults and new settings are stored in a dynamically created filed typically named modifiedConfig.json.  The factory default file (gaugeConfig.json) is never written to.  If an application setting (key : value pair) exist in both the gaugeConfig.json and modifiedConfig.JSON file, the value in modifiedConfig.JSON will be used. This allows the class to simply delete the modifiedConfig.json file to restore the configuration back to factory default.  
 ## Setup
 To init this class a typical call may look like:

 **const myAppMan = new AppMan(__dirname + '/gaugeConfig.json', __dirname + '/modifiedConfig.json');** 
 
 note: "__dirname" will point to the directory of the parent app consuming this class. 
 
 ---


