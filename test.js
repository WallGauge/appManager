
var descripition = "Grafton Gauge"
sendAlert();

function sendAlert(objectToSend = {[descripition]:"1"}){
    var objAsStr = JSON.stringify(objectToSend);
    var asArry = objAsStr.split('')
    var nums = '[';
    asArry.forEach((val, indx)=>{
        nums += '0x' + val.charCodeAt().toString(16);
        if(indx + 1 != asArry.length){nums += ','};
    })
    nums += ']';

    console.log(nums);




    //console.log('Calling gdbus to send alert to rgMan...');
    //var result = cp.execSync("/usr/bin/gdbus call --system --dest com.rgMan --object-path /com/rgMan/gaugeAlert --method org.bluez.GattCharacteristic1.WriteValue [" + bufToSend.toString('hex') + ']');
    //console.log('result = ' + result);
};