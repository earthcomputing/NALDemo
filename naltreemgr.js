'use strict';
var TreeMgrSvc = function(params) {
    params.dispatchTable = {"discover":discoverHandler,
                            "discovered":discoveredHandler,
                            "branchInfo":branchInfoHandler,
                            "failover":failoverHandler,
                            "failoverStatus":failoverStatusHandler};
    ServiceFactory.call(this,params);
    this.type = "TreeMgr";
    const svc = this;
    const nodeID = svc.getNodeID();
    const traphs = {};
    const portsTried = {};
    const failoverRequester = {};
    const sentBranchUpdate = {};
    this.getTreeID = function() { return nodeID; };
    this.getTraphs = function() { return traphs; };
    this.start = function() {
        svc.startSuper();
        for ( let p in svc.getPorts() ) {
            const discoverMsg = new DiscoverMsg({"sendingNodeID":nodeID,"treeID":nodeID,"hops":0,"branch":p});
            const letter = {"port":p,"target":defaultSvcID,"envelope":discoverMsg};
            debugOutput("Send start: " + svc.getLabel() + p + " " + letter.envelope.stringify());
            svc.send(letter);
        }
    };
    function discoverHandler(value) {
        const portID = value.portID;
        const envelope = value.envelope;
        debugOutput("Discover Delivered: " + svc.getLabel() + portID + " " + envelope.stringify());
        // Ignore message if I am the root of the tree
        if ( nodeID === envelope.getLetter().treeID ) return;
        const sendingNodeID = value.envelope.getSendingNodeID();
        const treeID = envelope.getTreeID();
        const msg = envelope.getLetter();
        const hops = msg.hops + 1;
        const branch = envelope.getBranch();
        const ports = svc.getPorts();
        if ( !traphs[treeID] ) {
            traphs[treeID] = [];
            const discoveredMsg = new DiscoveredMsg({"treeID":treeID,"sendingNodeID":nodeID,
                                                     "branch":branch + "," + portID});
            const reply = {"port":portID,"target":defaultSvcID,"envelope":discoveredMsg};
            svc.send(reply);
            forward(ports); 
        }
        const traphUpdate = {"treeID":treeID, "nodeID":sendingNodeID, "isChild":false,
                             "linkID":ports[portID].getLink().getID(),
                             "portID":portID,"hops":hops, "isConnected":true, "branch":branch};
        updateTraph({"traph":traphs[treeID],"update":traphUpdate,"portID":portID});
        debugOutput("TreeMgrSvc add: " + svc.getLabel() + JSON.stringify(traphUpdate));
        debugOutput("TreeMgrSvc traphs: " + svc.getLabel() + JSON.stringify(traphs[treeID][0]));
        function forward(ports) {
            // Forward message on all ports except the one it came in on
            for ( const pID in ports ) {
                if ( pID !== portID ) {
                    const discoverMsg = new DiscoverMsg({"sendingNodeID":svc.getNodeID(),"treeID":treeID,"hops":hops,"branch":branch + "," + pID});
                    const letter = {"port":pID,"target":defaultSvcID,"envelope":discoverMsg};
                    debugOutput("Forward Discover: " + svc.getLabel() + pID + " " + letter.envelope.stringify());
                    svc.send(letter);
                }
            }
        }
    }
    function discoveredHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const sendingNodeID = value.envelope.getSendingNodeID();
        const branch = value.envelope.getBranch();
        const ports = svc.getPorts();
        traphs[treeID] = traphs[treeID] || [];
        const traphUpdate = {"treeID":treeID, "nodeID":sendingNodeID, "isChild":true,
                             "linkID":ports[portID].getLink().getID(),
                             "portID":portID, "isConnected":true, "branch":branch};
        updateTraph({"traph":traphs[treeID],"update":traphUpdate,"portID":portID});
        debugOutput("Discovered Handler: " + svc.getLabel() + " child " + portID + " " + value.envelope.stringify());
    }
    function updateTraph(params) {
        const traph = params.traph;
        const update = params.update;
        const portID = params.portID;
        let updated = false;
        for ( const p in traph ) {
            if ( traph[p].portID === portID ) {
                traph[p] = update;
                updated = true;
            }
        }
        if ( !updated ) traph.push(update);
    }
    this.portDisconnected = function(portID) {
        for ( const treeID in traphs ) {
            const traph = traphs[treeID];
            const parentLinkFailed = (traph[0].portID === portID);
            let connected = false;
            let brokenBranch;
            for ( const p in traph ) { 
                if ( traph[p].portID === portID ) {
                    traph[p].isConnected = false;
                    if ( parentLinkFailed ) brokenBranch = traph[p].branch;
                    else                    traph[p].isChild = false;
                }
                if ( traph[p].isConnected ) connected = true;
            }
        if ( treeID === "N:2" )
            console.log("portDisconnected: " + svc.getNodeID());
            if ( connected ) {
                if ( parentLinkFailed && treeID !== nodeID ) {
                    findNewParent({"portID":portID, "myID":nodeID,
                                   "treeID":treeID, "traph":traph,
                                   "brokenBranch":brokenBranch, "oldParent":traph[0]});
                } else {
                    portsTried[treeID] = [];
                }
            } else console.error("Network partition: Cell " + nodeID + " has no connected ports");
        }
    }
    function findNewParent(params) {
        const portID = params.portID;
        const myID = params.myID;
        const treeID = params.treeID;
        const traph = params.traph;
        const oldParent = params.oldParent;
        const brokenBranch = params.brokenBranch;
        portsTried[treeID] = portsTried[treeID] || [];
        if ( treeID === "N:2"  )
            console.log("findNewParent: " + svc.getNodeID());
        // First look for a pruned port not on the broken branch
        for ( let i = 1; i < traph.length; i++ ) {  // traph[0] is parent
            if ( traph[i].isConnected && !traph[i].isChild &&
                 !sameBranch({"broken":brokenBranch,"traph":traph[i].branch}) &&
                 failover(traph[i]) ) return;
        }
        // If that fails, try a failover port on the broken branch
        for ( let i = 1; i < traph.length; i++ ) {
            if ( traph[i].isConnected && !traph[i].isChild &&
                 sameBranch({"broken":brokenBranch,"traph":traph[i].branch})  &&
                 failover(traph[i]) ) return;
        }
        // If that fails, find a child to failover to
        for ( let i = 1; i < traph.length; i++ ) {
            if ( traph[i].isConnected && traph[i].isChild && failover(traph[i]) ) return;
        }
        // If that fails, there's no failover branch from this node
        if ( oldParent.isConnected ) {
            const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"status":false,
                                                             "brokenBranch":brokenBranch});
            svc.send({"port":oldParent.portID,"target":defaultSvcID,"envelope":failoverStatusMsg});
            debugOutput("No failover: " + svc.getLabel() + "old parent " + traph[0].nodeID + " " + failoverStatusMsg.stringify());
        } else
            console.error("Network partition: Cell " + svc.getNodeID() + " found no path to root " + treeID);
        function failover(trialParent) {
            if ( trialParent.isConnected && portUntried(treeID,trialParent.portID) ) { 
                const failoverMsg = new FailoverMsg({"treeID":treeID,"brokenBranch":brokenBranch});
                svc.send({"port":trialParent.portID,"target":defaultSvcID,"envelope":failoverMsg});
                debugOutput("Failover: " + svc.getLabel() + "port " + trialParent.portID + " " + failoverMsg.stringify());
        if ( treeID === "N:2" )
            console.log("failover: " + svc.getNodeID());
                portsTried[treeID].push(trialParent.portID);
                return true;
            } else {
                return false;
            }
        }
    }
    function portUntried(treeID,portID) {
        return portsTried[treeID].indexOf(portID) < 0;
    }
    function sameBranch(params) {
        return ( 0 === params.traph.indexOf(params.broken) );
    }
    function failoverHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const brokenBranch = value.envelope.getBrokenBranch();
        const traph = traphs[treeID];
        failoverRequester[treeID] = portID;
        if ( treeID === "N:2" )
            console.log("failoverHandler: " + svc.getNodeID());
        portsTried[treeID] = portsTried[treeID] || [];
        portsTried[treeID].push(portID);  // Don't try somebody trying me
        debugOutput("Failover Handler: " + svc.getLabel() + "treeID " + treeID + " old parent " + traph[0].nodeID + " brokenBranch " + brokenBranch + " " + value.envelope.stringify());
        if ( sameBranch({"broken":brokenBranch,"traph":traph[0].branch}) ) {
            findNewParent({"portID":portID,"treeID":treeID, "traph":traph,"myID":svc.getNodeID(),
                           "brokenBranch":brokenBranch, "oldParent":traph[0]});
        } else { // Found failover path
            failoverSuccess({"treeID":treeID,"branch":traph[0].branch,"brokenBranch":brokenBranch});
        }
    }
    function failoverSuccess(params) {
        const treeID = params.treeID;
        const branch = params.branch;
        const brokenBranch = params.brokenBranch;
        if ( treeID === "N:2" )
            console.log("failoverSuccess: " + svc.getNodeID());
        portsTried[treeID] = [];
        const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"status":true,"branch":branch + "," + failoverRequester[treeID],"brokenBranch":brokenBranch});
        svc.send({"port":failoverRequester[treeID],"target":defaultSvcID,"envelope":failoverStatusMsg});
        debugOutput("Failover success: " + svc.getLabel() + "port " + failoverRequester[treeID] + " " + failoverStatusMsg.stringify());
    }
    function failoverStatusHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const branch = value.envelope.getBranch();
        const brokenBranch = value.envelope.getBrokenBranch();
        const isAccepted = value.envelope.getStatus();
        const myID = svc.getNodeID();
        const traph = traphs[treeID];
        debugOutput("Failover Status Handler: " + svc.getLabel() + "portID " + portID + " " + value.envelope.stringify());
        if ( isAccepted ) {
            const oldParent = traph[0];
            sendToFrontByPortID(traph,portID);
        if ( treeID === "N:2" )
            console.log("failoverStatusHandler: " + svc.getNodeID());
            // Tell my new parent to add me as a child
            // Should be done in failoverSuccess, but this works for now
            const discoveredMsg = new DiscoveredMsg({"treeID":treeID,"sendingNodeID":myID,
                                                     "branch":traph[0].branch + "," + traph[0].portID});
            svc.send({"port":portID,"target":defaultSvcID,"envelope":discoveredMsg});
            debugOutput("Inform new parent: " + svc.getLabel() + "new parent " + traph[0].nodeID + " " + discoveredMsg.stringify());
            sendBranchInfo({"treeID":treeID,"traph":traph,"branch":branch,"brokenBranch":brokenBranch});
            if ( oldParent.isConnected ) failoverSuccess({"treeID":treeID,"requester":oldParent.portID,"branch":branch,"brokenBranch":brokenBranch});
        } else {
            findNewParent({"treeID":treeID,"traph":traph,"brokenBranch":traph[0].branch,
                           "oldParent":traph[0]});
        }
        function sendToFrontByPortID(traph,portID) {
            for ( const t in traph ) {
                if ( traph[t].portID === portID ) {
                    sendToFront(traph,t);
                    break; // Not really needed since each portID occurs only once in a traph
                }
            }
        }
    }
    function sendBranchInfo(params) {
        const treeID = params.treeID;
        const traph = params.traph;
        const branch = params.branch;
        const brokenBranch = params.brokenBranch;
        if ( treeID === "N:2" )
            console.log("sendBranchInfo: " + svc.getNodeID());
        sentBranchUpdate[treeID] = sentBranchUpdate[treeID] || false;
        if ( !sentBranchUpdate[treeID] ) {
            let updateNeeded = false;
            for ( let t = 1; t < traph.length; t++ ) {  // traph[0] points to parent
                if ( traph[t].isConnected && sameBranch({"broken":brokenBranch,"traph":traph[t].branch}) ) {
                    updateNeeded = true;
                    const portID = traph[t].portID;
                    const branchInfoMsg = new BranchInfoMsg({"treeID":treeID,"newBranch":branch + "," + portID,"brokenBranch":brokenBranch});
                    const letter = {"port":portID,"target":defaultSvcID,"envelope":branchInfoMsg};
                    debugOutput("Send Branch Info: " + svc.getLabel() + "port " + portID + " " + letter.envelope.stringify());
                    svc.send(letter);
                }
            }
            /*
              A little too clever for my own good.  Without updateNeeded, I send new branch
              info on all ports with a broken branch every time I receive updated branch info 
              on one of my ports, but I only need to send it once.  Hence, sentBranchUpdate,
              but when do I reset it?  Here I'm resetting it when no traph entries meet the
              condition at the start of the above for loop.
             */
            sentBranchUpdate[treeID] = updateNeeded;
        }
    }
    function branchInfoHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const branch = value.envelope.getNewBranch();
        const brokenBranch = value.envelope.getBrokenBranch();
        debugOutput("Branch Info Handler: " + svc.getLabel() + "treeID " + treeID + " new branch " + branch + " " + value.envelope.stringify());
        const traph = traphs[treeID];
        if ( treeID === "N:2" )
            console.log("branchInfoHandler: " + svc.getNodeID());
        for ( let p = 0; p < traph.length; p++ ) {
            const isBroken = sameBranch({"broken":brokenBranch,"traph":traph[p].branch});
            if ( traph[p].portID === portID && isBroken ) {
                traph[p].branch = branch;
                sendBranchInfo({"treeID":treeID,"traph":traph,"branch":branch,"brokenBranch":brokenBranch});
            }
        }
    }
}
