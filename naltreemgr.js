'use strict';
var TreeMgrSvc = function(params) {
    const MAXTRIES = 2;
    const FAILOVERSUCCESS = "SUCCESS";
    const FAILOVERFAILURE = "FAILURE";
    const FAILOVERCLEANUP = "CLEANUP";
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
    const node = svc.getNode();
    const traphs = {};
    const portsTried = {};
    const brokenBranches = []; // Need to reset when a link reconnects
    const newParentPortID = {};
    const failoverRequester = {}; // Make a function of broken branch for overlapping failovers
    let symmetricFailover = {};
    this.getTreeID = function() { return nodeID; };
    this.getTraphs = function() { return traphs; };
    this.start = function() {
        svc.startSuper();
        traphs[nodeID] = [{"branch":"","hops":0,"isChild":false,"isConnected":true,
                          "linkID":"","nodeID":"","onBrokenBranch":false,"portID":"",
                          "treeID":nodeID}];
        for ( let p in svc.getPorts() ) {
            const discoverMsg = new DiscoverMsg({"sendingNodeID":nodeID,"treeID":nodeID,"hops":0,"branch":rootPath(p)});
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
        traphs[treeID] = initArray(traphs[treeID]);
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
        traphs[treeID] = initArray(traphs[treeID]);
        traphs[treeID].push({"treeID":treeID, "nodeID":sendingNodeID, "isChild":true,
                             "linkID":ports[portID].getLink().getID(), "hops":hops,
                             "portID":portID, "isConnected":true, "branch":branch,
                             "onBrokenBranch":false});
        debugOutput("Discovered Handler: " + svc.getLabel() + " child " + portID + " " + value.envelope.stringify());
    }
    this.portDisconnected = function(portID) {
        for ( const treeID in traphs ) {
            const traph = traphs[treeID];
            const parentLinkFailed = (traph[0].portID === portID);
            let connected = false;
            let brokenBranch;
            let brokenLinkID;
            //BREAKPOINT(eval(breakpointTest),"portDisconnected: tree " + treeID + " node " + svc.getNodeID());
            for ( const p in traph ) { 
                if ( traph[p].portID === portID ) {
                    traph[p].isConnected = false;
                    if ( parentLinkFailed ) {
                        brokenBranch = adjustPath(traph[p]);
                        brokenLinkID = traph[0].linkID;
                    }
                    else                    traph[p].isChild = false;
                }
                if ( traph[p].isConnected ) connected = true;
            }
            if ( connected ) {
                if ( parentLinkFailed && !node.isBroken() && treeID !== nodeID ) {
                    findNewParent({"treeID":treeID, "traph":traph,"brokenLinkID":brokenLinkID, "brokenBranch":brokenBranch});
                }
            } else console.log("Network partition: Cell " + nodeID + " has no connected ports");
        }
    }
    function findNewParent(params) {
        const treeID = params.treeID;
        const traph = params.traph;
        const brokenBranch = params.brokenBranch;
        const brokenLinkID = params.brokenLinkID;
        portsTried[treeID] = initArray(portsTried[treeID]);
        if ( portsTried[treeID].length === 0 ) portsTried[treeID].push(0); // First element is count of attempts
        BREAKPOINT(eval(breakpointTest), "findNewParent: tree " + treeID + " node " + svc.getNodeID());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        const trialParent = nextTrialParent(treeID,traph);
        if ( trialParent ) failover(trialParent);
        else {
            failoverFailure({"treeID":treeID,"traph":traph,"branch":traph[0].branch,"brokenLinkID":brokenLinkID,"brokenBranch":brokenBranch});
            delete portsTried[treeID];
        }
        function failover(trialParent) {
            const failoverMsg = new FailoverMsg({"treeID":treeID,"brokenLinkID":brokenLinkID,"brokenBranch":brokenBranch});
            debugOutput("Failover: " + svc.getLabel() + trialParent.nodeID + " " + failoverMsg.stringify());
            svc.send({"port":trialParent.portID,"target":defaultSvcID,"envelope":failoverMsg});
            portsTried[treeID].push(trialParent.portID);
            newParentPortID[treeID] = trialParent.portID;
        }
    }
    function failoverHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const brokenBranch = value.envelope.getBrokenBranch();
        const brokenLinkID = value.envelope.getBrokenLinkID();
        const traph = traphs[treeID];
        const failoverParams = {"treeID":treeID,"traph":traph,"branch":traph[0].branch,"brokenLinkID":brokenLinkID,"brokenBranch":brokenBranch};
        const newParentParams = {"treeID":treeID, "traph":traph,"brokenLinkID":brokenLinkID, "brokenBranch":brokenBranch};
        BREAKPOINT(eval(breakpointTest),"failoverHandler: tree " + treeID + " node " + svc.getNodeID());
        debugOutput("Failover Handler: " + svc.getLabel() + "old parent " + traph[0].nodeID + " " + value.envelope.stringify());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        failoverRequester[treeID] = initObject(failoverRequester[treeID]);
        failoverRequester[treeID][brokenLinkID] = initArray(failoverRequester[treeID][brokenLinkID]);
        failoverRequester[treeID][brokenLinkID].push(portID);
        const isCycle = failoverRequester[treeID][brokenLinkID].length > 1;
        if ( isCycle ) {
            failoverFailure(failoverParams);
            return;
        }
        portsTried[treeID] = initArray(portsTried[treeID]);
        if ( portsTried[treeID].length === 0 ) portsTried[treeID].push(0); // First element is count of attempts
        if ( portUntried(treeID,portID) || 
             (symmetricFailover[treeID] && symmetricFailover[treeID].portID === portID) ) { 
            portsTried[treeID].push(portID);
        } else { // Don't failover for someone I asked to failover for me
            symmetricFailover[treeID] = getTraphByPortID(traph,portID); // But remember who for later
            failoverFailure(failoverParams);
            return;
        }
        if ( traph[0].portID !== portID && (treeID === svc.getNodeID() || (!traph[0].onBrokenBranch && traph[0].isConnected)) ) {
            let branch = traph[0].branch;
            if ( treeID === svc.getNodeID() ) branch = rootPath(portID);
            failoverSuccess(failoverParams);
            delete portsTried[treeID];
        } else { // Didn't find a failover path, a single search for all requesters
            if ( getKeys(failoverRequester[treeID]).length === 1 ) findNewParent(newParentParams);
        }
    }
    function failoverSuccess(params) {
        failoverStatus(params,FAILOVERSUCCESS);
    }
    function failoverFailure(params) {
        failoverStatus(params,FAILOVERFAILURE);
    }
    function failoverCleanup(params) {
        // Like failoverFailure but doesn't clear failoverRequester
        const treeID = params.treeID;
        const save = clone(failoverRequester[treeID]);
        failoverStatus(params,FAILOVERCLEANUP);
        failoverRequester[treeID] = clone(save);
    }
    function failoverStatus(params,status) {
        const treeID = params.treeID;
        const traph = params.traph;
        const branch = params.branch;
        const brokenBranch = params.brokenBranch;
        const brokenLinkID = params.brokenLinkID;
        BREAKPOINT(eval(breakpointTest),"failoverStatus: tree " + treeID + " node " + svc.getNodeID());
        // I am the leafward node if I don't have any requesters
        getKeys(failoverRequester[treeID]).forEach(function(brokenLinkID){
            const p = getFailoverPort({"treeID":treeID,"brokenLinkID":brokenLinkID});
            const t = getTraphByPortID(traph,p);
            const linkID = getLinkIDFromPortID(traph,p);
            const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"brokenLinkID":brokenLinkID,"status":status,"branch":appendToBranch(branch,linkID),"hops":traph[0].hops+1,"brokenBranch":brokenBranch});
            svc.send({"port":p,"target":defaultSvcID,"envelope":failoverStatusMsg});
            debugOutput("Failover " + status + ": " + svc.getLabel() + linkID + " " + failoverStatusMsg.stringify());
        });
        function getFailoverPort(params) {
            const treeID = params.treeID;
            const brokenLinkID = params.brokenLinkID;
            const requester = failoverRequester[treeID][brokenLinkID];
            const p = requester.pop();
            if ( requester.length === 0 ) delete failoverRequester[treeID][brokenLinkID];
            if ( getKeys(failoverRequester[treeID]).length === 0 ) delete failoverRequester[treeID];
            return p;
        }
    }
    function failoverStatusHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const branch = value.envelope.getBranch();
        const hops = value.envelope.getHops();
        const brokenBranch = value.envelope.getBrokenBranch();
        const brokenLinkID = value.envelope.getBrokenLinkID();
        const status = value.envelope.getStatus();
        const myID = svc.getNodeID();
        const traph = traphs[treeID];
        const failoverParams = {"treeID":treeID,"traph":traph,"branch":branch,"brokenBranch":brokenBranch,"brokenLinkID":brokenLinkID};
        BREAKPOINT(eval(breakpointTest),"failoverStatusHandler: tree " + treeID + " node " + svc.getNodeID());
        debugOutput("Failover Status Handler: " + svc.getLabel() + "portID " + portID + " " + value.envelope.stringify());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        if ( status === FAILOVERSUCCESS ) {
            const newParent = getTraphByPortID(traph,portID);
            const oldParent = traph[0];
            debugOutput("Tree Update: " + oldParent.nodeID + " " + traph[0].nodeID);
            sendToFrontByPortID(traph,portID);
            sendPathUpdate({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch});
            if ( oldParent.isConnected ) { // Tell my old parent to remove me as a child
                const undiscoveredMsg = new UndiscoveredMsg({"treeID":treeID});
                svc.send({"port":oldParent.portID,"target":defaultSvcID,"envelope":undiscoveredMsg});
                debugOutput("Inform old parent: " + svc.getLabel() + "old parent " + oldParent.nodeID + " " + undiscoveredMsg.stringify());
            }
            informNewParent({"treeID":treeID,"traph":traph,"hops":hops,"branch":branch,"brokenBranch":brokenBranch});
            failoverSuccess(failoverParams);
            delete portsTried[treeID];
        } else {
            findNewParent({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch, "brokenLinkID":brokenLinkID});
        } 
    }
    function informNewParent(params) {
        const treeID = params.treeID;
        const traph = params.traph;
        const hops = params.hops;
        const branch = params.branch;
        const brokenBranch = params.brokenBranch;
        const myID = svc.getNodeID();
        //BREAKPOINT(eval(breakpointTest),"informNewParent: tree " + treeID + " node " + svc.getNodeID());
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
                const pathData = traph[t].linkID;
                let newBranch = appendToBranch(traph[0].branch,pathData);
                if ( t === 0 ) newBranch = traph[0].branch;
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
        const brokenLinkID = envelope.getBrokenLinkID();
        const traph = traphs[treeID];
        const sender = getTraphByPortID(traph,portID).nodeID;
        BREAKPOINT(eval(breakpointTest), "rediscoverHandler: tree " + treeID + " node " + svc.getNodeID() + " " + portID);
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        debugOutput("Rediscover Handler: " + svc.getLabel() + portID + " " + sender + " " + envelope.stringify());
        const traphToUpdate = getTraphByPortID(traph,portID);
        if ( isOnBrokenBranch(branch) || !traphToUpdate.onBrokenBranch ||
             isOnBranch({"longer":branch,"shorter":traphToUpdate.branch}) ) return;
        checkForCycle(branch);
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        traphToUpdate.hops = hops;
        traphToUpdate.branch = branch;
        traphToUpdate.onBrokenBranch = false;
        // Forward message on all ports on the broken branch if message is from my parent
        if ( newParentPortID[treeID] === portID ||
             !newParentPortID[treeID] && traph[0].portID === portID ) {
            sendPathUpdate({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch});
            delete newParentPortID[treeID];
        }
        function checkForCycle(branch) {
            // This test is a cheat because it relies on unique linkIDs; used for debugging only.
            const array = branch.split(",");
            const last = array.pop();
            if ( array.indexOf(last) >= 0 ) {
                console.log("Cycle detected in rediscoverHandler");
            }
        }
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
    }
    function undiscoveredHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        //BREAKPOINT(eval(breakpointTest), "undiscoveredHandler: tree " + treeID + " node " + svc.getNodeID() + " " + portID);
        const traphToUpdate = getTraphByPortID(traphs[treeID],portID);
        traphToUpdate.isChild = false;
    }
// TreeMgr utility functions
    function isOnBranch(params) {
        if ( true ) {
            // Uses full path info
            return 0 === params.longer.indexOf(params.shorter);
        } else if ( true ) {
            // Uses root port only for trie data
            const branch = params.longer.split(",");
            const test = params.shorter.split(",");
            return branch[0] === test[0];
        } else {
            // No path info, just find a path to the root
            // Generate an error for now
            throw "isOnBranch: Case not implemented";
        }
    }
    function markBrokenBranches(params) {
        const traph = params.traph;
        const brokenBranch = params.brokenBranch;
        // Must remember broken branches for next failure
        if ( brokenBranches.indexOf(brokenBranch) === -1 ) brokenBranches.push(brokenBranch);
        for ( const t in traph ) {
            traph[t].onBrokenBranch = isOnBrokenBranch(traph[t].branch);
        }
    }
    function isOnBrokenBranch(branch) {
        let onBrokenBranch = false;
        brokenBranches.forEach(function(brokenBranch) {
            if ( isOnBranch({"longer":branch,"shorter":brokenBranch}) ) onBrokenBranch = true;
        });
        return onBrokenBranch;
    }        
    function getTraphByPortID(traph,portID) {
        for ( const t in traph ) {
            if ( traph[t].portID === portID ) return traph[t];
        }
        throw "No entry for portID " + portID;
    }
    function nextTrialParent(treeID,traph) {
        // Uncomment the one you want to use
        // let trialParent = prunedLinksFirst(treeID,traph);
        // let trialParent = nextSmallestHops(treeID,traph);
        let trialParent = nextSmallestHopsBiasPruned(treeID,traph);
        // let trialParent = nextSmallestHopsBiasPrunedUnbroken(treeID,traph);
        // Never use current parent as trial parent
        if ( trialParent && trialParent.portID === traph[0].portID ) {
            portsTried[treeID].push(trialParent.portID);
            trialParent = nextTrialParent(treeID,traph);
        }
        if ( !trialParent && symmetricFailover[treeID] ) {
            trialParent = symmetricFailover[treeID];
            delete symmetricFailover[treeID];
        }
        if ( !trialParent && portsTried[treeID][0] < MAXTRIES ) {
            portsTried[treeID] = [portsTried[treeID][0] + 1];
            trialParent = nextTrialParent(treeID,traph);
        }
        return trialParent;
    }
    function prunedLinksFirst(treeID,traph) {
        // First look for a pruned port not on the broken branch
        for ( let t = 1; t < traph.length; t++ ) {  // traph[0] is parent
            if ( traph[t].isConnected && !traph[t].isChild && !traph[t].onBrokenBranch &&
                 portUntried(treeID,traph[t].portID) ) return traph[t];
        }
        // If that fails, try a pruned port on the broken branch
        for ( let t = 1; t < traph.length; t++ ) {
            if ( traph[t].isConnected && !traph[t].isChild && traph[t].onBrokenBranch &&
                 portUntried(treeID,traph[t].portID) ) return traph[t];
        }
        // If that fails, try a child
        for ( let t = 1; t < traph.length; t++ ) {
            if ( traph[t].isConnected && traph[t].isChild &&
                 portUntried(treeID,traph[t].portID) ) return trah[t];
        }
    }   
    function nextSmallestHops(treeID,traph) {
        let min; // No matter how big a number I pick, it won't be big enough!
        let minElement;
        getKeys(traph).forEach(function(t) {
            if ( traph[t].isConnected && (!min || traph[t].hops <= min)
                 && portUntried(treeID,traph[t].portID)  ) {
                min = min || traph[t].hops;
                minElement = t;
            }
        });
        if ( minElement ) return traph[minElement];
        else              return null;
    }
    function nextSmallestHopsBiasPruned(treeID,traph) {
        let min; // No matter how big a number I pick, it won't be big enough!
        let minElement;
        getKeys(traph).forEach(function(t) {
            if ( traph[t].isConnected && (!min || traph[t].hops <= min)
                 && portUntried(treeID,traph[t].portID)  ) {
                min = min || traph[t].hops;
                if ( !minElement || !traph[t].isChild) minElement = t;
            }
        });
        if ( minElement ) return traph[minElement];
        else              return null;
    }
    function nextSmallestHopsBiasPrunedUnbroken(treeID,traph) {
        let min; // No matter how big a number I pick, it won't be big enough!
        let minElement;
        getKeys(traph).forEach(function(t) {
            if ( traph[t].isConnected && (!min || traph[t].hops <= min)
                 && portUntried(treeID,traph[t].portID)  ) {
                min = min || traph[t].hops;
                if ( !minElement || !traph[t].isChild && !traph[t].onBrokenBranch ) minElement = t;
                else if ( !minElement || !traph[t].isChild ) minElement = t;
            }
        });
        if ( minElement ) return traph[minElement];
        else              return null;
    }
    function portUntried(treeID,portID) {
        return portsTried[treeID] && portsTried[treeID].indexOf(portID) < 0;
    }
    function reenablePort(treeID,portID) {
        const index = portsTried[treeID].indexOf(portID);
        if ( index >= 0 ) portsTried[treeID].splice(index,1);
    }
    function isLeafwardNode(treeID,brokenBranchID) {
        failoverRequester[treeID] = failoverRequester[treeID] || {};
        failoverRequester[treeID][brokenBranchID] = failoverRequester[treeID][brokenBranchID] || [];
        return failoverRequester[treeID][brokenBranchID].length === 1 &&
            failoverRequester[treeID][brokenBranchID][0] === "leafward";
    }
    function appendToBranch(branch,element) { return branch + "," + element; }
    function trimBranch(branch) {
        let array = branch.split(",");
        const last = array.pop();
        return array.join(",");
    }
    function rootPath(portID) { return svc.getNodeID() + "-" + portID; };
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
    function initObject(o) {return o || {}; };
    function initArray(a) {return a || []; };
    function getKeys(o) {
        let keys = [];
        if ( o && typeof o === "object" ) keys = Object.keys(o);
        return keys;
    }
}
