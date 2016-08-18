'use strict';
let svcMsgs = 0;
var ServiceFactory = function(params) {
    const svc = this;
    const id = params.svcID;
    const node = params.node;
    const dispatchTable = params.dispatchTable;
    let sendPromises = params.send;
    let fillResolvers = params.fill;
    let deliverPromises = params.deliver;
    let emptyRecvResolvers = params.empty;
    const nports = node.getNports();
    const label = id + " " + node.getID() + " ";
    this.getID = function() { return id; };
    this.getNodeID = function() { return node.getID(); };
    this.getPorts = function() { return node.getPorts(); };
    this.getNports = function() { return node.getNports(); };
    this.getLabel = function() { return label; };
    this.getType = function() { return this.type; };
    this.getPendingQ = function() { return pendingParams; };
    this.stop = function() {
        console.log("Stop " + id + " on " + node.getID()); };
    this.startSuper = function() {
        for ( let p in this.getPorts() ) {
            emptyRecvBuffer(p,"Starting");
            waitOnDeliver(p);
        }
    };
    function waitOnDeliver(p) {
        debugOutput("Svc Wait on Deliver: " + label + p + " Promise " + deliverPromises[p].id);
        deliverPromises[p].then(function(value) {
            const p = value.portID;
            const promise = value.promise;
            const type = value.envelope.getType();
            debugOutput("Svc Delivered: " + label + p + " Promise " + deliverPromises[p].id + " " + value.envelope.stringify());
            if ( dispatchTable[type] )       dispatchTable[type](value);
            else                             throw "Unknown message type " + type;
            deliverPromises[p] = promise;
            emptyRecvBuffer(p,"Processed");
            waitOnDeliver(p);
        });
    }
    function emptyRecvBuffer(p,msg) {
        debugOutput("Empty recv resolve: " + label + p + " Resolve " + emptyRecvResolvers[p].id);
        const resolver = makeResolver();
        emptyRecvResolvers[p].fulfill({"target":id, "type":"emptyRecvBuffer: " + msg,"promise":resolver.promise});
        emptyRecvResolvers[p] = resolver;
    }
    function recvEmptyHandler(value) {
        const portID = value.portID;
        const svcID = value.target;
        const envelope = value.envelope;  
        debugOutput("Recv Empty Delivered: " + svc.getLabel() + portID + " Promise " + svc.deliverPromises[portID].id + " " + envelope.stringify());
    }
    const pendingParams = {};
    const sendPromisesAvailable = {};
    const portsUsed = {};
    const ports = this.getPorts();
    Object.keys(ports).forEach(function(p) {
        pendingParams[p] = [];
        sendPromisesAvailable[p] = true;
    });
    this.send = function(params) {
        const svc = this;
        const p = params.port;
        const envelope = params.envelope;
        const target = params.target;
        //BREAKPOINT(svc.getNodeID() === "N:1" && p === "P:1","Queue length = " + pendingParams[p].length + ", add msg " + envelope.id);
        pendingParams[p].push(params);
        debugOutput("Queuing message: " + svc.getLabel() + p + " connected " + ports[p].isConnected()  + " queue size " + pendingParams[p].length + " " + envelope.stringify());
        if ( sendPromisesAvailable[p] ) {
            sendPromisesAvailable[p] = false;
            waitOnSendPromises();
        }
        function waitOnSendPromises(){        
            debugOutput("Wait on Send: " + svc.getLabel() + p + " connected " + ports[p].isConnected() + " Promise " + sendPromises[p].id + " " + pendingParams[p][0].envelope.stringify());
            sendPromises[p].then(function(value) {
                const portID = value.portID;
                const params = pendingParams[portID].shift();
                if ( !params ) throw "No pending messages to send"
                const svcID = params.target;
                const p = params.port;
                const envelope = params.envelope;
                debugOutput("Sending: " + svc.getLabel() + p + " connected " + ports[p].isConnected()  + " Promise " + sendPromises[p].id + " Resolve " + fillResolvers[p].id + " " + envelope.stringify());
                const promise = value.promise;
                let resolver = makeResolver();
                fillResolvers[p].fulfill({"portID":p,   // For debug only
                                          "source":id,  // For debug only?
                                          "promiseID":fillResolvers[p].id,
                                          "target":target || defaultSvcID,
                                          "envelope":envelope,
                                          "promise":resolver.promise});
                fillResolvers[p] = resolver;
                sendPromises[p] = promise;
                //BREAKPOINT(svc.getNodeID() === "N:1" && p === "P:1","Queue length = " + pendingParams[p].length);
                if ( pendingParams[portID].length > 0 ) {
                    waitOnSendPromises();
                } else sendPromisesAvailable[portID] = true;
                svcMsgs++;
                if ( svcMsgs % 2000 === 0 ) console.log(svcMsgs +" messages sent");
            });
        }
    };
    const publicFns = this;
    return publicFns;
};
