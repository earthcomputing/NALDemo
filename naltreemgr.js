'use strict';
var TreeMgrSvc = function(params) {
    params.dispatchTable = {"discover":discoverHandler,
                            "discovered":discoveredHandler,
                            "failover":failoverHandler,
                            "failoverStatus":failoverStatusHandler,
                            "rediscover":rediscoverHandler,
                            "rediscovered":rediscoveredHandler,
                            "undiscovered":undiscoveredHandler};
    ServiceFactory.call(this,params);
    this.type = "TreeMgr";
    const svc = this;
    const nodeID = svc.getNodeID();
    const traphs = {};
    const portsTried = {};
    const failoverRequester = {}; // Make a function of broken branch for overlapping failovers
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
            //BREAKPOINT(eval(breakpointTest),"portDisconnected: tree " + treeID + " node " + svc.getNodeID());
            portsTried[treeID] = [];
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
                    failoverRequester[treeID] = ["leafward"];
                    findNewParent({"treeID":treeID, "traph":traph,
                                   "brokenBranch":brokenBranch, "oldParent":traph[0]});
                }
            } else console.log("Network partition: Cell " + nodeID + " has no connected ports");
        }
    }
    function findNewParent(params) {
        const treeID = params.treeID;
        const traph = params.traph;
        const oldParent = params.oldParent;
        const brokenBranch = params.brokenBranch;
        portsTried[treeID] = portsTried[treeID] || [];
        BREAKPOINT(eval(breakpointTest), "findNewParent: tree " + treeID + " node " + svc.getNodeID());
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
        if ( failoverRequester[treeID].length > 0 && failoverRequester[treeID][0] !== "leafward" ) {
            failoverFailure({"treeID":treeID,"brokenBranch":brokenBranch});
        }
        else console.log("Network partition: Cell " + svc.getNodeID() + " found no path to root " + treeID);
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
        BREAKPOINT(eval(breakpointTest),"failoverHandler: tree " + treeID + " node " + svc.getNodeID());
        failoverRequester[treeID] = failoverRequester[treeID] || [];
        const isCycle = failoverRequester[treeID].length > 0 || failoverRequester[treeID][0] === "leafward";
        failoverRequester[treeID].push(portID);
        if ( isCycle ) {
            failoverFailure({"treeID":treeID,"brokenBranch":brokenBranch});
            return;
        }
        portsTried[treeID] = portsTried[treeID] || [];
        portsTried[treeID].push(portID);  // Don't try somebody trying me
        debugOutput("Failover Handler: " + svc.getLabel() + "treeID " + treeID + " old parent " + traph[0].nodeID + value.envelope.stringify());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        if ( treeID === svc.getNodeID() || (!traph[0].onBrokenBranch && traph[0].isConnected) ) {
            const linkID = getLinkIDFromPortID(traph,portID);
            let newBranch = appendToBranch(traph[0].branch,linkID);
            if ( treeID === svc.getNodeID() ) newBranch = portID;
            failoverSuccess({"treeID":treeID,"portID":portID,"branch":newBranch,"hops":traph[0].hops+1,"brokenBranch":brokenBranch});
        } else { // Didn't find a failover path
            findNewParent({"treeID":treeID, "traph":traph,"myID":svc.getNodeID(),
                           "brokenBranch":brokenBranch, "oldParent":traph[0]});
        }
    }
    function failoverSuccess(params) {
        const treeID = params.treeID;
        const branch = params.branch;
        const hops = params.hops;
        const brokenBranch = params.brokenBranch;
        BREAKPOINT(eval(breakpointTest),"failoverSuccess: tree " + treeID + " node " + svc.getNodeID());
        const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"status":true,"branch":branch,"hops":hops,"brokenBranch":brokenBranch});
        const p = failoverRequester[treeID].pop();
        debugOutput("Failover success: " + svc.getLabel() + p + " " + failoverStatusMsg.stringify());
        svc.send({"port":p,"target":defaultSvcID,"envelope":failoverStatusMsg});
    }
    function failoverFailure(params) {
        const treeID = params.treeID;
        const brokenBranch = params.brokenBranch;
        BREAKPOINT(eval(breakpointTest),"failoverFailure: tree " + treeID + " node " + svc.getNodeID());
        const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"status":false,
                                                         "brokenBranch":brokenBranch});
        debugOutput("No failover: " + svc.getLabel() + " " + failoverStatusMsg.stringify());
        const p = failoverRequester[treeID].pop();
        svc.send({"port":p,"target":defaultSvcID,"envelope":failoverStatusMsg});
    }
    function failoverStatusHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const branch = value.envelope.getBranch();
        const hops = value.envelope.getHops();
        const brokenBranch = value.envelope.getBrokenBranch();
        const isAccepted = value.envelope.getStatus();
        const myID = svc.getNodeID();
        const traph = traphs[treeID];
        debugOutput("Failover Status Handler: " + svc.getLabel() + "portID " + portID + " " + value.envelope.stringify());
        BREAKPOINT(eval(breakpointTest),"failoverStatusHandler: tree " + treeID + " node " + svc.getNodeID());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        if ( isAccepted ) {
            portsTried[treeID] = [];
            const oldParent = traph[0];
            sendToFrontByPortID(traph,portID);
            if ( failoverRequester[treeID].length > 0 && failoverRequester[treeID][0] !== "leafward" ) {
                // Tell my old parent to remove me as a child
                const undiscoveredMsg = new UndiscoveredMsg({"treeID":treeID});
                svc.send({"port":oldParent.portID,"target":defaultSvcID,"envelope":undiscoveredMsg});
                debugOutput("Inform old parent: " + svc.getLabel() + "old parent " + oldParent.nodeID + " " + undiscoveredMsg.stringify());
                const p = failoverRequester[treeID].slice(-1)[0];
                const linkID = getLinkIDFromPortID(traph,p);
                failoverSuccess({"treeID":treeID,"branch":branch+","+linkID,"hops":hops+1,"brokenBranch":brokenBranch});
            }
            informNewParent({"treeID":treeID,"traph":traph,"hops":hops,"branch":branch,"brokenBranch":brokenBranch});
            sendPathUpdate({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch});
            failoverRequester[treeID] = [];
        } else {
            findNewParent({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch,
                           "oldParent":traph[0]});
        }
    }
    function informNewParent(params) {
        const treeID = params.treeID;
        const traph = params.traph;
        const hops = params.hops;
        const branch = params.branch;
        const brokenBranch = params.brokenBranch;
        const myID = svc.getNodeID();
        BREAKPOINT(eval(breakpointTest),"informNewParent: tree " + treeID + " node " + svc.getNodeID());
        traph[0].isChild = false;
        traph[0].branch = branch;
        traph[0].hops = hops;
        traph[0].onBrokenBranch = false;
        // Tell my new parent to add me as a child
        const rediscoveredMsg = new RediscoveredMsg(
            {"treeID":treeID,"hops":traph[0].hops,"sendingNodeID":myID,
             "branch":traph[0].branch,"brokenBranch":brokenBranch});
        debugOutput("Inform new parent: " + svc.getLabel() + "new parent " + traph[0].nodeID + " " + rediscoveredMsg.stringify());
        svc.send({"port":traph[0].portID,"target":defaultSvcID,"envelope":rediscoveredMsg});
    }
    function sendPathUpdate(params) {
        const treeID = params.treeID;
        const traph = params.traph;
        const brokenBranch = params.brokenBranch;
        const myID = svc.getNodeID()
        //BREAKPOINT(eval(breakpointTest),"sendPathUpdate: tree " + treeID + " node " + myID + " hops " + traph[0].hops + " branch " + traph[0].branch);
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        // Tell my neighbors on broken branch about new branch info
        for ( let t = 0; t < traph.length; t++ ) { 
            if ( traph[t].isConnected ) {
                const trieData = traph[t].linkID;
                const newBranch = appendToBranch(traph[0].branch,trieData);
                const rediscoverMsg = new RediscoverMsg(
                    {"sendingNodeID":svc.getNodeID(),"treeID":treeID,"hops":traph[0].hops+1,"branch":newBranch,
                     "brokenBranch":brokenBranch});
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
        const hops = envelope.getHops();
        const branch = envelope.getBranch();
        const brokenBranch = envelope.getBrokenBranch();
        const traph = traphs[treeID];
        const sender = getTraphByPortID(traph,portID).nodeID;
        debugOutput("Rediscover Handler: " + svc.getLabel() + portID + " " + sender + " " + envelope.stringify());
        //BREAKPOINT(eval(breakpointTest), "rediscoverHandler: tree " + treeID + " node " + svc.getNodeID() + " " + portID);
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        const traphToUpdate = getTraphByPortID(traph,portID);
        if ( !traphToUpdate.onBrokenBranch ) return;
        traphToUpdate.hops = hops;
        traphToUpdate.branch = branch;
        traphToUpdate.onBrokenBranch = false;
        //traphToUpdate.branch = adjustPath(traphToUpdate);
        portsTried[treeID] = []; // Only works if rediscover doesn't overlap failover
        // Forward message on all ports on the broken branch if message is from my parent
        if ( traph[0].portID === portID )
            sendPathUpdate({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch});
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
        const traphToUpdate = getTraphByPortID(traphs[treeID],portID);
        traphToUpdate.branch = branch;
        traphToUpdate.hops = hops;
        traphToUpdate.isChild = true;
        traphToUpdate.onBrokenBranch = false;
        debugOutput("Rediscovered Handler: " + svc.getLabel() + "child " + portID + " " + value.envelope.stringify());
        if ( traph[0].onBrokenBranch ) informNewParent({"treeID":treeID,"traph":traph,"hops":hops-1,"branch":trimBranch(branch),"brokenBranch":brokenBranch});
        sendPathUpdate({"treeID":treeID,"traph":traph,"hops":hops,"branch":branch,"brokenBranch":brokenBranch});
    }
    function undiscoveredHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        BREAKPOINT(eval(breakpointTest), "undiscoveredHandler: tree " + treeID + " node " + svc.getNodeID() + " " + portID);
        const traphToUpdate = getTraphByPortID(traphs[treeID],portID);
        traphToUpdate.isChild = false;
    }
// TreeMgr utility functions
    function portUntried(treeID,portID) {
        return portsTried[treeID].indexOf(portID) < 0;
    }
    function sameBranch(params) {
        //const traph = params.traphBranch.split(",");
        //const test = params.test.split(",");
        //return traph[0] === test[0];
        return ( 0 === params.traphBranch.indexOf(params.test) );
    }
    function markBrokenBranches(params) {
        const traph = params.traph;
        const brokenBranch = params.brokenBranch;
        for ( const t in traph ) {
            if ( sameBranch({"traphBranch":traph[t].branch,"test":brokenBranch}) ) traph[t].onBrokenBranch = true;
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
    function trimBranch(branch) {
        let array = branch.split(",");
        const last = array.pop();
        return array.join(",");
    }
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
