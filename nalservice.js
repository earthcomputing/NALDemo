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
    this.stop = function() {
        console.log("Stop " + id + " on " + node.getID()); };
    this.startSuper = function() {
        for ( let p in this.getPorts() ) {
            emptyRecvBuffer(p,"Starting");
            waitOnDeliver(p);
        }
    }
    function waitOnDeliver(p) {
        debugOutput("Svc Wait on Deliver: " + label + p + " Promise " + deliverPromises[p].id);
        deliverPromises[p].then(function(value) {
            const p = value.portID;
            const promise = value.promise;
            const type = value.envelope.getType();
            debugOutput("Svc Delivered: " + label + p + " Promise " + deliverPromises[p].id + " " + value.envelope.stringify());
            if ( dispatchTable[type] )       dispatchTable[type](value);
            else if ( type === "recvEmpty" ) recvEmptyHandler(value);
            else                             throw "Unknown message type " + type;
            deliverPromises[p] = promise;
            emptyRecvBuffer(p,value.envelope.stringify());
            waitOnDeliver(p);
        });
    }
    function emptyRecvBuffer(p,msg) {
        debugOutput("Empty recv resolve: " + label + p + " Promise " + emptyRecvResolvers[p].id + " " + msg);
        const resolver = makeResolver();
        const emptyMsg = new RecvBufferEmptyMsg("Empty Recv Buffer");
        emptyRecvResolvers[p].fulfill({"target":id,
                                       "envelope":emptyMsg,
                                       "promise":resolver.promise});
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
        pendingParams[p].push(params);
        if ( ports[p].isConnected() ) debugOutput("Queuing message: " + svc.getLabel() + p + " " + envelope.stringify());
        if ( sendPromisesAvailable[p] ) {
            sendPromisesAvailable[p] = false;
            waitOnSendPromises();
        }
        function waitOnSendPromises(){        
           if ( ports[p].isConnected() ) debugOutput("Wait on Send: " + svc.getLabel() + p + " Promise " + sendPromises[p].id + " " + pendingParams[p][0].envelope.stringify());
            sendPromises[p].then(function(value) {
                const portID = value.portID;
                const params = pendingParams[portID].shift();
                if ( !params ) throw "No pending messages to send"
                const svcID = params.target;
                const p = params.port;
                const envelope = params.envelope;
                if ( ports[p].isConnected() ) debugOutput("Sending: " + svc.getLabel() + p + " Promise " + sendPromises[p].id + " " + envelope.stringify());
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
                if ( pendingParams[portID].length > 0 ) {
                    emptyRecvBuffer(p,value.envelope.stringify());
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
