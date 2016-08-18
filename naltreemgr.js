'use strict';
var TreeMgrSvc = function(params) {
    params.dispatchTable = {"discover":discoverHandler,
                            "discovered":discoveredHandler,
                            "failover":failoverHandler,
                            "failoverStatus":failoverStatusHandler,
                            "rediscover":rediscoverHandler,
                            "rediscovered":rediscoveredHandler};
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
        debugOutput("Discover Handler: " + svc.getLabel() + portID + " " + envelope.stringify());
        // Ignore message if I am the root of the tree
        if ( nodeID === envelope.getLetter().treeID ) return;
        const sendingNodeID = value.envelope.getSendingNodeID();
        const treeID = envelope.getTreeID();
        const hops = envelope.getHops() + 1;
        const branch = envelope.getBranch();
        const ports = svc.getPorts();
        traphs[treeID] = traphs[treeID] || [];
        const traph = traphs[treeID];
        let isParent = false;
        if ( !traph[0] ) {
            isParent = true;
            const discoveredMsg = new DiscoveredMsg({"treeID":treeID,"sendingNodeID":nodeID,
                                                     "hops":hops,"branch":branch});
            const reply = {"port":portID,"target":defaultSvcID,"envelope":discoveredMsg};
            debugOutput("Discovered: " + svc.getLabel() + portID + " " + discoveredMsg.stringify());
            svc.send(reply);
            forward(ports); 
        }
        const update = ({"treeID":treeID, "nodeID":sendingNodeID, "isChild":false,
                         "linkID":ports[portID].getLink().getID(), "onBrokenBranch":false,
                         "portID":portID,"hops":hops, "isConnected":true, "branch":branch});
        traphs[treeID].push(update);
        debugOutput("TreeMgrSvc add: " + svc.getLabel() + JSON.stringify(update));
        debugOutput("TreeMgrSvc traphs: " + svc.getLabel() + JSON.stringify(traphs[treeID][0]));
        function forward(ports) {
            // Forward message on all ports except the one it came in on
            for ( const pID in ports ) {
                if ( pID !== portID ) {
                    const link = ports[pID].getLink();
                    if ( !link || !link.isBroken() ) {
                        let trieData = pID;
                        if ( link ) trieData = link.getID();
                        const discoverMsg = new DiscoverMsg({"sendingNodeID":svc.getNodeID(),"treeID":treeID,"hops":hops,"branch":appendToBranch(branch,trieData)});
                        const letter = {"port":pID,"target":defaultSvcID,"envelope":discoverMsg};
                        debugOutput("Forward Discover: " + svc.getLabel() + pID + " " + letter.envelope.stringify());
                        svc.send(letter);
                    }
                }
            }
        }
    }
    function discoveredHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const hops = value.envelope.getHops();
        const sendingNodeID = value.envelope.getSendingNodeID();
        const branch = value.envelope.getBranch();
        const ports = svc.getPorts();
        traphs[treeID] = traphs[treeID] || [];
        traphs[treeID].push({"treeID":treeID, "nodeID":sendingNodeID, "isChild":true,
                             "linkID":ports[portID].getLink().getID(), "hops":hops,
                             "portID":portID, "isConnected":true, "branch":branch});
        debugOutput("Discovered Handler: " + svc.getLabel() + " child " + portID + " " + value.envelope.stringify());
    }
    this.portDisconnected = function(portID) {
        for ( const treeID in traphs ) {
            const traph = traphs[treeID];
            const parentLinkFailed = (traph[0].portID === portID);
            let connected = false;
            let brokenBranch;
            BREAKPOINT(eval(breakpointTest),"portDisconnected: " + treeID + " node " + svc.getNodeID());
            failoverRequester[treeID] = [];
            for ( const p in traph ) { 
                if ( traph[p].portID === portID ) {
                    traph[p].isConnected = false;
                    if ( parentLinkFailed ) brokenBranch = adjustPath(traph[p]);
                    else                    traph[p].isChild = false;
                }
                if ( traph[p].isConnected ) connected = true;
            }
            if ( connected ) {
                if ( parentLinkFailed && treeID !== nodeID ) {
                    findNewParent({"treeID":treeID, "traph":traph,
                                   "brokenBranch":brokenBranch, "oldParent":traph[0]});
                } else {
                    portsTried[treeID] = [];
                }
            } else console.error("Network partition: Cell " + nodeID + " has no connected ports");
        }
    }
    function findNewParent(params) {
        const treeID = params.treeID;
        const traph = params.traph;
        const oldParent = params.oldParent;
        const brokenBranch = params.brokenBranch;
        portsTried[treeID] = portsTried[treeID] || [];
        BREAKPOINT(eval(breakpointTest), "findNewParent: " + treeID + " node " + svc.getNodeID());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        // First look for a pruned port not on the broken branch
        for ( let i = 1; i < traph.length; i++ ) {  // traph[0] is parent
            if ( traph[i].isConnected && !traph[i].isChild && !traph[i].onBrokenBranch &&
                 failover(traph[i]) ) return;
        }
        // If that fails, try a failover port on the broken branch
        for ( let i = 1; i < traph.length; i++ ) {
            if ( traph[i].isConnected && !traph[i].isChild && traph[i].onBrokenBranch &&
                 failover(traph[i]) ) return;
        }
        // If that fails, find a child to failover to
        for ( let i = 1; i < traph.length; i++ ) {
            if ( traph[i].isConnected && traph[i].isChild && failover(traph[i]) ) return;
        }
        // If that fails, there's no failover branch from this node
        if ( failoverRequester[treeID].length > 0 ) {
            const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"status":false,
                                                             "brokenBranch":brokenBranch});
            debugOutput("No failover: " + svc.getLabel() + "old parent " + traph[0].nodeID + " " + failoverStatusMsg.stringify());
            const p = failoverRequester[treeID].pop();
            svc.send({"port":p,"target":defaultSvcID,"envelope":failoverStatusMsg});
        } else
            console.error("Network partition: Cell " + svc.getNodeID() + " found no path to root " + treeID);
        function failover(trialParent) {
            if ( trialParent.isConnected && portUntried(treeID,trialParent.portID) ) { 
                const failoverMsg = new FailoverMsg({"treeID":treeID,"brokenBranch":brokenBranch});
                debugOutput("Failover: " + svc.getLabel()+ trialParent.portID + " " + failoverMsg.stringify());
                svc.send({"port":trialParent.portID,"target":defaultSvcID,"envelope":failoverMsg});
                portsTried[treeID].push(trialParent.portID);
                return true;
            } else {
                return false;
            }
        }
    }
    function failoverHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const brokenBranch = value.envelope.getBrokenBranch();
        const traph = traphs[treeID];
        failoverRequester[treeID] = failoverRequester[treeID] || [];
        failoverRequester[treeID].push(portID);
        portsTried[treeID] = portsTried[treeID] || [];
        portsTried[treeID].push(portID);  // Don't try somebody trying me
        debugOutput("Failover Handler: " + svc.getLabel() + "treeID " + treeID + " old parent " + traph[0].nodeID + " brokenBranch " + brokenBranch + " " + value.envelope.stringify());
        BREAKPOINT(eval(breakpointTest),"failoverHandler: " + treeID + " node " + svc.getNodeID());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        if ( traph[0].onBrokenBranch || !traph[0].isConnected ) {
            findNewParent({"portID":portID,"treeID":treeID, "traph":traph,"myID":svc.getNodeID(),
                           "brokenBranch":brokenBranch, "oldParent":traph[0]});
        } else { // Found failover path
            const linkID = getLinkIDFromPortID(traph,portID);
            failoverSuccess({"treeID":treeID,"branch":appendToBranch(traph[0].branch,linkID),"brokenBranch":brokenBranch});
        }
    }
    function failoverSuccess(params) {
        const treeID = params.treeID;
        const branch = params.branch;
        const brokenBranch = params.brokenBranch;
        portsTried[treeID] = [];
        BREAKPOINT(eval(breakpointTest),"failoverSuccess: " + treeID + " node " + svc.getNodeID());
        const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"status":true,"branch":branch,"brokenBranch":brokenBranch});
        const p = failoverRequester[treeID].pop();
        debugOutput("Failover success: " + svc.getLabel() + p + " " + failoverStatusMsg.stringify());
        svc.send({"port":p,"target":defaultSvcID,"envelope":failoverStatusMsg});
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
        BREAKPOINT(eval(breakpointTest),"failoverStatusHandler: " + treeID + " node " + svc.getNodeID());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        if ( isAccepted ) {
            if ( failoverRequester[treeID].length > 0 ) {
                const p = failoverRequester[treeID].slice(-1)[0];
                const linkID = getLinkIDFromPortID(traph,p);
                failoverSuccess({"treeID":treeID,"branch":branch+","+linkID,"brokenBranch":brokenBranch});
            }
            sendToFrontByPortID(traph,portID);
            traph[0].isChild = false;
            traph[0].branch = branch;
            traph[0].onBrokenBranch = false;
            // Tell my new parent to add me as a child
            const rediscoveredMsg = new RediscoveredMsg(
                {"treeID":treeID,"hops":traph[0].hops+1,"sendingNodeID":myID,
                 "branch":appendToBranch(traph[0].branch,traph[0].linkID),"brokenBranch":brokenBranch});
            debugOutput("Inform new parent: " + svc.getLabel() + "new parent " + traph[0].nodeID + " " + rediscoveredMsg.stringify());
            svc.send({"port":portID,"target":defaultSvcID,"envelope":rediscoveredMsg});
            sendPathUpdate({"treeID":treeID,"traph":traph,"hops":traph[0].hops,"branch":branch,"brokenBranch":brokenBranch});
        } else {
            findNewParent({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch,
                           "oldParent":traph[0]});
        }
    }
    function sendPathUpdate(params) {
        const treeID = params.treeID;
        const traph = params.traph;
        const hops = params.hops;
        const branch = params.branch;
        const brokenBranch = params.brokenBranch;
        const myID = svc.getNodeID()
        // Tell my neighbors on broken branch about new branch info
        for ( let t = 1; t < traph.length; t++ ) { // Downstream nodes must send to parent
            if ( traph[t].isConnected ) {
                const trieData = traph[t].linkID;
                const newBranch = appendToBranch(branch,trieData);
                if ( traph[t].isChild ) traph[t].branch = newBranch;
                const rediscoverMsg = new RediscoverMsg(
                    {"sendingNodeID":svc.getNodeID(),"treeID":treeID,"hops":traph[t].hops+1,
                     "branch":newBranch,"brokenBranch":brokenBranch});
                const letter = {"port":traph[t].portID,"target":defaultSvcID,"envelope":rediscoverMsg};
                debugOutput("Send Rediscover: " + svc.getLabel() + traph[t].portID + " " + traph[t].nodeID + " " + letter.envelope.stringify());
                svc.send(letter);
            }
        }
    }        
    function rediscoverHandler(value) {
        const portID = value.portID;
        const envelope = value.envelope;
        // Ignore message if I am the root of the tree
        if ( nodeID === envelope.getLetter().treeID ) return;
        const sendingNodeID = value.envelope.getSendingNodeID();
        const treeID = envelope.getTreeID();
        const hops = envelope.getHops() + 1;
        const branch = envelope.getBranch();
        const brokenBranch = envelope.getBrokenBranch();
        const traph = traphs[treeID];
        const sender = getTraphByPortID(traph,portID).nodeID;
        debugOutput("Rediscover Handler: " + svc.getLabel() + portID + " " + sender + " " + envelope.stringify());
        //BREAKPOINT(eval(breakpointTest), "rediscoverHandler: tree " + treeID + " node " + svc.getNodeID() + " " + portID);
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        const traphToUpdate = getTraphByPortID(traph,portID);
        if ( !traphToUpdate.onBrokenBranch ) return;
        // Forward message on all ports on the broken branch if from my parent
        if ( traph[0].portID === portID ) sendPathUpdate({"treeID":treeID,"traph":traph,"hops":hops,"branch":branch,"brokenBranch":brokenBranch});
        traphToUpdate.hops = hops;
        traphToUpdate.branch = branch;
        traphToUpdate.onBrokenBranch = false;
        traphToUpdate.branch = adjustPath(traphToUpdate);
    }
    function rediscoveredHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const hops = value.envelope.getHops();
        const brokenBranch = value.envelope.getBrokenBranch();
        const sendingNodeID = value.envelope.getSendingNodeID();
        const branch = value.envelope.getBranch();
        const traph = traphs[treeID];
        //BREAKPOINT(eval(breakpointTest), "rediscoveredHandler: tree " + treeID + " node " + svc.getNodeID() + " " + portID);
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        let traphToUpdate = getTraphByPortID(traphs[treeID],portID);
        traphToUpdate.hops = hops;
        traphToUpdate.isChild = true;
        traphToUpdate.branch = branch;
        traphToUpdate.branch = adjustPath(traphToUpdate);
        debugOutput("Rediscovered Handler: " + svc.getLabel() + "child " + portID + " " + value.envelope.stringify());
    }
// TreeMgr utility functions
    function portUntried(treeID,portID) {
        return portsTried[treeID].indexOf(portID) < 0;
    }
    function sameBranch(params) {
        return ( 0 === params.traphBranch.indexOf(params.broken) );
    }
    function markBrokenBranches(params) {
        const traph = params.traph;
        const brokenBranch = params.brokenBranch;
        for ( const t in traph ) {
            if ( sameBranch({"traphBranch":traph[t].branch,"broken":brokenBranch}) ) traph[t].onBrokenBranch = true;
            else traph[t].onBrokenBranch = false;
        }
    }
    function getTraphByPortID(traph,portID) {
        for ( const t in traph ) {
            if ( traph[t].portID === portID ) return traph[t];
        }
        throw "No entry for portID " + portID;
    }
    function appendToBranch(branch,element) { return branch + "," + element; } 
    function adjustPath(traph) {
        // Remove extra elements added by child
        let adjusted = traph.branch;
        if ( traph.isChild ) {
            const array = traph.branch.split(",");
            array.pop();
            adjusted = array.join(",");
        }
        return adjusted;
    }
    function getParent(traph) { return traph[0]; }
    function sendToFrontByPortID(traph,portID) {
        for ( const t in traph ) {
            if ( traph[t].portID === portID ) {
                sendToFront(traph,t);
                break; // Not really needed since each portID occurs only once in a traph
            }
        }
    }
    function getLinkIDFromPortID(traph,portID) {
        for ( const t in traph ) {
            if ( traph[t].portID === portID ) return traph[t].linkID;
        }
        throw "getLinkIDFromPortID: No entry for port: " + portID;
    }
}
