

var myKeyBuffer = parseKey('array of bytes [6b 4e 4c bb a3 3a 01 77 a1 8d 47 2c 88 c9 65 22 db 01 fe c5 90 7b 7b fc a5 c7 7c 52 0e f8 63 0f ]');
console.log('buffer follows')
console.log(myKeyBuffer)

var myResponse = parseText('   array of bytes "Key is available"');
console.log('parseText ->' + myResponse + '<-');

/**
 * Parse the key from an arry of bytes that is returned from a dbus-send command.
 * 
 * Returns a buffer
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
 * returns a string between two quotes 
 * 
 * @param {*} keyAsString = ->    array of bytes "Key is available"<-
 */

function parseText(keyAsString){
    var x = keyAsString.split('"');
    return x[1];
};