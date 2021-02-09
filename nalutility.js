'use strict';
let debugCount = 0;
function debugOutput(msg,condition) {
    if ( !doTrace ) return;
    const msgPlus = getSourceLine() + ": " + msg;
    // Display only messages that match the blueprint filter
    let filter;
    if ( msgFilter ) filter = msg.indexOf(msgFilter) >= 0;
    else             filter = true;
    // Never display a message that doesn't satisfy the specified condition
    if ( !((condition === undefined) || condition) ) return;
    // Display all messages
    if ( blueprint.showMsgs.length === 0 && filter ) console.debug(debugCount++,msgPlus);
    // Display requested messages
    blueprint.showMsgs.forEach(function(msgIndex) {
        if ( msg.indexOf(debugMsgs[msgIndex]) === 0 && filter ) console.debug(debugCount++,msgPlus);
    });
}
// Get the line number of the call
function getSourceLine() {
    try { throw Error("") } catch(err) {
        let caller_line = err.stack.split("\n")[4];
        if ( !caller_line || caller_line.indexOf("native") ) caller_line = err.stack.split("\n")[3];
        const index = caller_line.indexOf("at ");
        const clean = caller_line.slice(index+2, caller_line.length);
        const trimmed = clean.split("/").pop().split(":");
        trimmed.pop();
        return trimmed.join(" ");
    }
}
let rcount = 0; // Used to debug promises
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
function initObject(o) {return o || {}; };
function initArray(a) {return a || []; };
function getKeys(o) {
    let keys = [];
    if ( o && typeof o === "object" ) keys = Object.keys(o);
    return keys;
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
function getPendingQ(nodeID) {
    const nodes = dataCenter.getNodes();
    const node = nodes[nodeID];
    const treeMgr = node.getServices()[defaultSvcID];
    return treeMgr.getPendingQ();
}
function getAllPendingQ() {
    let output ={};
    const nodes = dataCenter.getNodes();
    Object.keys(nodes).forEach(function(nodeID) {
        const queue = getPendingQ(nodeID);
        const ports = nodes[nodeID].getPorts();
        Object.keys(ports).forEach(function(portID) {
            if ( ports[portID].isConnected() ) {
                if ( queue[portID].length > 0 ) {
                    output[nodeID] = output[nodeID] || {};
                    output[nodeID][portID] = (output[nodeID][portID]||{});
                    output[nodeID][portID] = queue[portID];
                }
            }
        });
    });
    return output;
}
function getTraph(node,tree) {
    const nodes = dataCenter.getNodes();
    if ( nodes[node] ) {
        const svcs = nodes[node].getServices();
        const svc = svcs[defaultSvcID];
        return svc.getTraphs()[tree];
    } else return "No node named " + node;
}
// An if-block that returns a result.  clauses = [[cond,fn,params],...]
function iffun(clauses) {
    const clause = clauses.shift();
    if ( !clause ) return undefined;
    if ( clause[0] ) return clause[1]();
    else return iffun(clauses);
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
