'use strict';
let traceMsgs = [48,49,50,52];
let config;
let doTrace = false;
let blueprint;
let linkDisplayParams;
let nodeDisplayParams;
function setConfig(value) {
    if ( value ) {
        d3.select("svg").selectAll(["line","circle"]).remove();
        config = configuration(value);
        if ( value === "grid" ) {
            const size = Number(document.getElementById("gridSize").value);
            if ( size > 3 ) config.nodes = new Array(size);
            else alert("Number of cells must be > 3");            
        }
        document.getElementById("buildButton").disabled=false;
    }
    blueprint = {
        "useGUIDs": false, "nports":config.nports,
        "showMsgs": traceMsgs, "msgFilter": "string to match",
        "nodes":config.nodes, "links":config.links};       
    linkDisplayParams = {
        "shape":"line","before":".node",
        "classes":{"default":"link",
                   "tree":"linktree",
                   "broken":"linkbroken"},
        "eventData":{}, "attrs":{}};
    nodeDisplayParams = {
        "shape":"circle",
        "classes":{"default":"node",
                   "tree":"nodetree",
                   "root":"noderoot",
                   "broken":"nodebroken",},
        "eventData":{"delay":250},
        "attrs":{"r":10,"offsetX":20,"offsetY":20,
                 "xscale":config.xscale,"yscale":config.yscale,
                 "fill":"black"}};
}
const defaultSvcID = "S:TreeMgr";
// showMsgs = [] to show all
const debugMsgs = {
    0:"Add TreeMgrSvc to ",            // DataCenter
    1:"Entangle LR: ",                 // Link
    2:"Wait on Port Ready ",           //
    3:"Port Ready ",                   //
    4:"Link Ack Resolve ",             //
    5:"Match Ready ",                  //
    6:"Match Ready Resolved ",         //
    7:"Match Ready resolve receive ",  //
    8:"Wait on Transmit ",             //
    9:"Transmit ",                     //
    10:"Match Transmit resolve ",      //
    11:"Previously matched ",          //
    12:"New Service ",                 // Node
    13:"Wait on Recv Empty ",          // Port
    14:"Recv Empty ",                  //
    15:"Port ready resolve ",          //
    16:"Port Wait on Ack ",            //
    17:"Link Ack ",                    //
    18:"Empty send resolve ",          //
    19:"Port Wait on Recv: ",          //
    20:"Deliver resolve ",             //
    21:"Buffer Contents Undefined",    // BufferFactory
    22:"Send Wait on Fill ",           // SendBuffer
    23:"Send Fill ",                   //
    24:"Transmit resolve ",            //
    25:"Fill Wait on Fill ",           //
    26:"Send Wait on Empty ",          //
    27:"Send Empty resolved ",         //
    28:"Send resolve ",                //
    29:"Recv Wait on Empty ",          // RecvBuffer
    30:"Recv Buffer Empty ",           //
    31:"Recv Wait on Deliver ",        //
    32:"Recv Delivered ",              //
    33:"Svc Wait on Deliver ",         // ServiceFactory
    34:"Svc Delivered ",               //
    35:"Empty recv resolve ",          //
    36:"Queuing message ",             //
    37:"Wait on Send ",                //
    38:"Sending ",                     //
    39:"Send start ",                  // TreeMgrSvc
    40:"Discovered Handler ",          //
    41:"Discover Delivered ",          //
    42:"TreeMgrSvc add ",              //
    43:"TreeMgrSvc services ",         //
    44:"Forward Discover ",            //
    45:"Recv Empty Delivered ",        //
    46:"Send Branch Info ",            // Failover
    47:"Forward Rediscover ",          // 
    48:"Branch Info Handler ",         //
    49:"Inform new parent (nonchild)", //
    50:"Inform old parent (nonchild)", //
    51:"No failover",                  //
    52:"Failover ",                    //
    53:"Failover Handler ",            //
    54:"Failover Status Handler ",     //
    55:"Parent not connected ",        //
};
function configuration(configName) {
    const config = configurations[configName];
    if ( !config ) console.log("No configuration named " + configName);
    else           return config;
}
function traceOn() { doTrace = true; return "Trace on"; };
function traceOff() { doTrace = false; return "Trace off"; };
function trace(msgs) {
    if ( msgs ) {
        traceMsgs = [];
        for ( let i = 0; i < arguments.length; i++ ) {
            traceMsgs.push(arguments[i]);
        }
        return traceOn();
    } else return traceOff();
}
function dataCenterMsgs() { return [1]; }
function linkMsgs() { return sequence(2,11); }
function nodeMsgs() { return [12]; }
function portMsgs() { return sequence(13,20); }
function bufferFactorMsgs() { return [21]; }
function sendBufferMsgs() { return sequence(22,28); }
function recvBufferMsgs() { return sequence(29,32); }
function serviceFactoryMsgs() { return sequence(33,40); }
function treeMgrMsgs() { return sequence(41,46); }
function buildTreesMsgs() { return sequence(); }
function failoverMsgs() { return sequence(48,57); }
function sequence(start,end) {
    const s = [];
    for ( let i = start; i <= end; i++ ) s.push(i);
    return s;
}
const debugData = {};
function recordDebugData(item,data) {
    debugData[item] = debugData[item] || [];
    debugData[item].push(data);
}
