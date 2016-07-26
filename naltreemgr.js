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
                                                     "branch":branch});
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
        let found = false;
        BREAKPOINT(update.treeID === "d" && svc.getNodeID() === "E",
                   "updateTraph: tree " + update.treeID + " node " + svc.getNodeID());
        for ( const p in traph ) {
            if ( traph[p].portID === portID ) found = true;
        }
        if ( !found ) traph.push(update);
    }
    this.portDisconnected = function(portID) {
        for ( const treeID in traphs ) {
            const traph = traphs[treeID];
            const parentLinkFailed = (traph[0].portID === portID);
            let connected = false;
            let brokenBranch;
            BREAKPOINT(treeID === "d","portDisconnected: " + treeID + " node " + svc.getNodeID());
            for ( const p in traph ) { 
                if ( traph[p].portID === portID ) {
                    traph[p].isConnected = false;
                    if ( parentLinkFailed ) brokenBranch = adjust(traph[p]);
                    else                    traph[p].isChild = false;
                }
                if ( traph[p].isConnected ) connected = true;
            }
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
        function adjust(traph) {
            // Remove extra elements added by Discovered
            //BREAKPOINT(traph.treeID === "d",
            //           "adjust: " + traph.treeID + " node " + svc.getNodeID());
            let adjusted = traph.branch;
            if ( false && traph.isChild ) {
                const array = traph.branch.split(",");
                array.pop();
                adjusted = array.join(",");
            }
            return adjusted;
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
        portsTried[treeID] = portsTried[treeID] || [];
        portsTried[treeID].push(portID);  // Don't try somebody trying me
        debugOutput("Failover Handler: " + svc.getLabel() + "treeID " + treeID + " old parent " + traph[0].nodeID + " brokenBranch " + brokenBranch + " " + value.envelope.stringify());
        if ( sameBranch({"broken":brokenBranch,"traph":traph[0].branch}) ) {
            findNewParent({"portID":portID,"treeID":treeID, "traph":traph,"myID":svc.getNodeID(),
                           "brokenBranch":brokenBranch, "oldParent":traph[0]});
        } else { // Found failover path
            BREAKPOINT(treeID === "d","failoverHandler: " + treeID + " node " + svc.getNodeID());
            failoverSuccess({"treeID":treeID,"branchPrefix":traph[0].branch,"brokenBranch":brokenBranch});
            sendBranchInfo({"treeID":treeID,"traph":traph,"branchPrefix":traph[0].branch + "," + failoverRequester[treeID],"brokenBranch":brokenBranch});
        }
    }
    function failoverSuccess(params) {
        const treeID = params.treeID;
        const branchPrefix = params.branchPrefix;
        const brokenBranch = params.brokenBranch;
        portsTried[treeID] = [];
        if ( failoverRequester[treeID] ) {
            const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"status":true,"branchPrefix":branchPrefix + "," + failoverRequester[treeID],"brokenBranch":brokenBranch});
            svc.send({"port":failoverRequester[treeID],"target":defaultSvcID,"envelope":failoverStatusMsg});
            debugOutput("Failover success: " + svc.getLabel() + "port " + failoverRequester[treeID] + " " + failoverStatusMsg.stringify());
        }
    }
    function failoverStatusHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const branchPrefix = value.envelope.getBranchPrefix();
        const brokenBranch = value.envelope.getBrokenBranch();
        const isAccepted = value.envelope.getStatus();
        const myID = svc.getNodeID();
        const traph = traphs[treeID];
        debugOutput("Failover Status Handler: " + svc.getLabel() + "portID " + portID + " " + value.envelope.stringify());
        if ( isAccepted ) {
            const oldParent = traph[0];
            sendToFrontByPortID(traph,portID);
            // Tell my new parent to add me as a child
            // Should be done in failoverSuccess, but this works for now
            const discoveredMsg = new DiscoveredMsg({"treeID":treeID,"sendingNodeID":myID,
                                                     "branch":traph[0].branch});
            svc.send({"port":portID,"target":defaultSvcID,"envelope":discoveredMsg});
            debugOutput("Inform new parent: " + svc.getLabel() + "new parent " + traph[0].nodeID + " " + discoveredMsg.stringify());
            //BREAKPOINT(treeID === "d","failoverStatusHandler: " + treeID + " node " + svc.getNodeID());
            failoverSuccess({"treeID":treeID,"requester":oldParent.portID,"branchPrefix":branchPrefix,"brokenBranch":brokenBranch});
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
        const branchPrefix = params.branchPrefix;
        const brokenBranch = params.brokenBranch;
        BREAKPOINT(treeID === "d","sendBranchInfo: " + treeID + " node " + svc.getNodeID());
        for ( let t = 0; t < traph.length; t++ ) { 
            if ( traph[t].isConnected && sameBranch({"broken":brokenBranch,"traph":traph[t].branch}) ) {
                traph[t].branch = branchPrefix + traph[t].branch.substr(brokenBranch.length);
                const portID = traph[t].portID;
                const branchInfoMsg = new BranchInfoMsg({"treeID":treeID,"branchPrefix":branchPrefix,"brokenBranch":brokenBranch});
                const letter = {"port":portID,"target":defaultSvcID,"envelope":branchInfoMsg};
                debugOutput("Send Branch Info: " + svc.getLabel() + "port " + portID + " " + letter.envelope.stringify());
            }
        }
    }
    function branchInfoHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const branchPrefix = value.envelope.getBranchPrefix();
        const brokenBranch = value.envelope.getBrokenBranch();
        debugOutput("Branch Info Handler: " + svc.getLabel() + "treeID " + treeID + " new branch " + branchPrefix + " " + value.envelope.stringify());
        const traph = traphs[treeID];
        //BREAKPOINT(treeID === "d","branchInfoHandler: " + treeID + " node " + svc.getNodeID());
        sendBranchInfo({"treeID":treeID,"traph":traph,"branchPrefix":branchPrefix + "," + failoverRequester[treeID],"brokenBranch":brokenBranch});
    }
}
