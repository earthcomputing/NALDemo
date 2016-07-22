'use strict';
let debugCount = 0;
function debugOutput(msg,condition) {
    if ( !doTrace ) return;
    // Always display messages that matches the blueprint filter
    if ( msg.indexOf(blueprint.msgFilter) >= 0 ) console.debug(debugCount++,msg);
    // Never display a message that doesn't satisfy the specified condition
    if ( !((condition === undefined) || condition) ) return;
    // Display all messages
    if ( blueprint.showMsgs.length === 0 ) console.debug(debugCount++,msg);
    // Display requested messages
    blueprint.showMsgs.forEach(function(msgIndex) {
        if ( msg.indexOf(debugMsgs[msgIndex]) === 0 ) console.debug(debugCount++,msg);
    });
}
function makeResolver() {
    let result = {};
    result.promise = new Promise(function(fulfill,reject){
        result.fulfill = fulfill;
        result.reject = reject;
    });
    result.id = rcount;
    result.promise.id = rcount;
    rcount++;
    return result;
}
function sendToBack(array,index) {
    if ( -1 < index && index < array.length - 1 ) {
        const cut = array.splice(index,1)[0];
        array.push(cut);
    }
}
function sendToFront(array,index) {
    if ( 0 < index && index < array.length ) {
        const cut = array.splice(index,1)[0];
        array.unshift(cut);
    }
}
function clone(o) {
    if ( "object" === typeof o ) return JSON.parse(JSON.stringify(o));
    else     return o;
}
function rejected(error) {
    console.error(JSON.stringify(error));
}
// Copied from http://jcward.com/UUID.js for safety
/**
 * Fast UUID generator, RFC4122 version 4 compliant.
 * @author Jeff Ward (jcward.com).
 * @license MIT license
 * @link http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
 **/
var UUID = (function() {
    var self = {};
    var lut = []; for (var i=0; i<256; i++) { lut[i] = (i<16?'0':'')+(i).toString(16); }
    self.generate = function() {
        var d0 = Math.random()*0xffffffff|0;
        var d1 = Math.random()*0xffffffff|0;
        var d2 = Math.random()*0xffffffff|0;
        var d3 = Math.random()*0xffffffff|0;
        return lut[d0&0xff]+lut[d0>>8&0xff]+lut[d0>>16&0xff]+lut[d0>>24&0xff]+'-'+
            lut[d1&0xff]+lut[d1>>8&0xff]+'-'+lut[d1>>16&0x0f|0x40]+lut[d1>>24&0xff]+'-'+
            lut[d2&0x3f|0x80]+lut[d2>>8&0xff]+'-'+lut[d2>>16&0xff]+lut[d2>>24&0xff]+
            lut[d3&0xff]+lut[d3>>8&0xff]+lut[d3>>16&0xff]+lut[d3>>24&0xff];
    };
    return self;
})();
