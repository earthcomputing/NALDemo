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
    const node = svc.getNode();
    const traphs = {};
    const portsTried = {};
    const brokenBranches = []; // Need to reset when a link reconnects
    const newParentPortID = {};
    const failoverRequester = {}; // Make a function of broken branch for overlapping failovers
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
                    failoverRequester[treeID] = failoverRequester[treeID] || {};
                    failoverRequester[treeID][brokenLinkID] = ["leafward"];
                    findNewParent({"treeID":treeID, "traph":traph,
                                   "brokenLinkID":brokenLinkID, "brokenBranch":brokenBranch});
                }
            } else console.log("Network partition: Cell " + nodeID + " has no connected ports");
        }
    }
    function findNewParent(params) {
        const treeID = params.treeID;
        const traph = params.traph;
        const brokenBranch = params.brokenBranch;
        const brokenLinkID = params.brokenLinkID;
        portsTried[treeID] = portsTried[treeID] || [];
        BREAKPOINT(eval(breakpointTest), "findNewParent: tree " + treeID + " node " + svc.getNodeID());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        const trialParent = nextTrialParent(treeID,traph);
        if ( trialParent ) failover(trialParent);
        else if ( !isLeafwardNode(treeID,brokenLinkID) ) failoverFailure({"treeID":treeID,"brokenBranch":brokenBranch});
        else console.log("Network partition: Cell " + svc.getNodeID() + " found no path to root " + treeID);
        function failover(trialParent) {
            if ( portUntried(treeID,trialParent.portID) ) { 
                const failoverMsg = new FailoverMsg({"treeID":treeID,"brokenLinkID":brokenLinkID,"brokenBranch":brokenBranch});
                debugOutput("Failover: " + svc.getLabel()+ trialParent.portID + " " + failoverMsg.stringify());
                svc.send({"port":trialParent.portID,"target":defaultSvcID,"envelope":failoverMsg});
                portsTried[treeID].push(trialParent.portID);
                newParentPortID[treeID] = trialParent.portID;
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
        const brokenLinkID = value.envelope.getBrokenLinkID();
        const traph = traphs[treeID];
        BREAKPOINT(eval(breakpointTest),"failoverHandler: tree " + treeID + " node " + svc.getNodeID());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        failoverRequester[treeID] = failoverRequester[treeID] || {};
        failoverRequester[treeID][brokenLinkID] = failoverRequester[treeID][brokenLinkID] ||[];
        const isCycle = failoverRequester[treeID][brokenLinkID].length > 0 ||
                        failoverRequester[treeID][brokenLinkID] === "leafward";
        failoverRequester[treeID][brokenLinkID].push(portID);
        if ( isCycle ) {
            failoverFailure({"treeID":treeID,"brokenBranch":brokenBranch});
            return;
        }
        portsTried[treeID] = portsTried[treeID] || [];
        if ( portUntried(treeID,portID) ) { // Not a port I failed over onto
            // A single search for a new path works no matter how many broken links need it
            if ( Object.keys(failoverRequester[treeID]).length > 1 ) return;
            portsTried[treeID].push(portID);  // Don't try somebody trying me
        }
        debugOutput("Failover Handler: " + svc.getLabel() + "old parent " + traph[0].nodeID + " " + value.envelope.stringify());
        if ( traph[0].portID !== portID && (treeID === svc.getNodeID() || (!traph[0].onBrokenBranch && traph[0].isConnected)) ) {
            const linkID = getLinkIDFromPortID(traph,portID);
            let newBranch = appendToBranch(traph[0].branch,linkID);
            if ( treeID === svc.getNodeID() ) newBranch = rootPath(portID);
            Object.keys(failoverRequester[treeID]).forEach(function(brokenLinkID){
                failoverSuccess({"treeID":treeID,"portID":portID,"branch":newBranch,"hops":traph[0].hops+1,"brokenLinkID":brokenLinkID,"brokenBranch":brokenBranch});
            });
            delete failoverRequester[treeID];
        } else { // Didn't find a failover path
            findNewParent({"treeID":treeID, "traph":traph,"myID":svc.getNodeID(),
                           "brokenLinkID":brokenLinkID,
                           "brokenBranch":brokenBranch, "oldParent":traph[0]});
        }
    }
    function failoverSuccess(params) {
        const treeID = params.treeID;
        const branch = params.branch;
        const hops = params.hops;
        const brokenBranch = params.brokenBranch;
        const brokenLinkID = params.brokenLinkID;
        BREAKPOINT(eval(breakpointTest),"failoverSuccess: tree " + treeID + " node " + svc.getNodeID());
        const p = failoverRequester[treeID][brokenLinkID].pop();
        if ( p && p !== "leafward" ) {
            const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"brokenLinkID":brokenLinkID,"status":true,"branch":branch,"hops":hops,"brokenBranch":brokenBranch});
            debugOutput("Failover success: " + svc.getLabel() + p + " " + failoverStatusMsg.stringify());
            svc.send({"port":p,"target":defaultSvcID,"envelope":failoverStatusMsg});
        }
    }
    function failoverFailure(params) {
        const treeID = params.treeID;
        const brokenBranch = params.brokenBranch;
        BREAKPOINT(eval(breakpointTest),"failoverFailure: tree " + treeID + " node " + svc.getNodeID());
        Object.keys(failoverRequester[treeID]).forEach(function(brokenLinkID){
            const p = failoverRequester[treeID][brokenLinkID].pop();
            if ( p && p !== "leafward" ) {
                const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"status":false, "brokenLinkID":brokenLinkID, "brokenBranch":brokenBranch});
                svc.send({"port":p,"target":defaultSvcID,"envelope":failoverStatusMsg});
                debugOutput("No failover: " + svc.getLabel() + " " + failoverStatusMsg.stringify());
            }
        });
        delete newParentPortID[treeID];
    }
    function failoverStatusHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const branch = value.envelope.getBranch();
        const hops = value.envelope.getHops();
        const brokenBranch = value.envelope.getBrokenBranch();
        const brokenLinkID = value.envelope.getBrokenLinkID();
        const isAccepted = value.envelope.getStatus();
        const myID = svc.getNodeID();
        const traph = traphs[treeID];
        debugOutput("Failover Status Handler: " + svc.getLabel() + "portID " + portID + " " + value.envelope.stringify());
        BREAKPOINT(eval(breakpointTest),"failoverStatusHandler: tree " + treeID + " node " + svc.getNodeID());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        if ( isAccepted ) {
            delete portsTried[treeID];
            const oldParent = traph[0];
            // I may already have found a new path to the root
            if ( traph[0].onBrokenBranch ) sendToFrontByPortID(traph,portID);
            traph[0].isChild = false;
            debugOutput("Tree Update: " + oldParent.nodeID + " " + traph[0].nodeID);
            failoverRequester[treeID] = failoverRequester[treeID] || {};
            failoverRequester[treeID][brokenLinkID] = failoverRequester[treeID][brokenLinkID] || [];
            Object.keys(failoverRequester[treeID]).forEach(function(brokenLinkID){
                if ( failoverRequester[treeID][brokenLinkID].length > 0 &&
                     failoverRequester[treeID][brokenLinkID][0] !== "leafward" ) {
                    // Tell my old parent to remove me as a child
                    const undiscoveredMsg = new UndiscoveredMsg({"treeID":treeID});
                    svc.send({"port":oldParent.portID,"target":defaultSvcID,"envelope":undiscoveredMsg});
                    debugOutput("Inform old parent: " + svc.getLabel() + "old parent " + oldParent.nodeID + " " + undiscoveredMsg.stringify());
                    const p = failoverRequester[treeID][brokenLinkID].slice(-1)[0];
                    const linkID = getLinkIDFromPortID(traph,p);
                    failoverSuccess({"treeID":treeID,"branch":branch+","+linkID,"hops":hops+1,"brokenBranch":brokenBranch,"brokenLinkID":brokenLinkID});
                }
            });
            if ( oldParent.onBrokenBranch ) {
                informNewParent({"treeID":treeID,"traph":traph,"hops":hops,"branch":branch,"brokenBranch":brokenBranch});
                sendPathUpdate({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch});
        }
            delete failoverRequester[treeID];
        } else {
            findNewParent({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch,
                           "brokenLinkID":brokenLinkID,"oldParent":traph[0]});
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
        //console.error("Skipping sendPathUpdate to avoid infinite loop");
        //return;
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
                let newBranch = appendToBranch(traph[0].branch,trieData);
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
        debugOutput("Rediscover Handler: " + svc.getLabel() + portID + " " + sender + " " + envelope.stringify());
        BREAKPOINT(eval(breakpointTest), "rediscoverHandler: tree " + treeID + " node " + svc.getNodeID() + " " + portID);
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        const traphToUpdate = getTraphByPortID(traph,portID);
        if ( !traphToUpdate.onBrokenBranch ) return;
        traphToUpdate.hops = hops;
        traphToUpdate.branch = branch;
        traphToUpdate.onBrokenBranch = false;
        // Forward message on all ports on the broken branch if message is from my parent
        if ( newParentPortID[treeID] === portID ||
             !newParentPortID[treeID] && traph[0].portID === portID ) {
            sendPathUpdate({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch});
            delete newParentPortID[treeID];
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
        BREAKPOINT(eval(breakpointTest), "undiscoveredHandler: tree " + treeID + " node " + svc.getNodeID() + " " + portID);
        const traphToUpdate = getTraphByPortID(traphs[treeID],portID);
        traphToUpdate.isChild = false;
    }
// TreeMgr utility functions
    function sameBranch(params) {
        if ( true ) {
            // Uses full trie info
            return ( 0 === params.traphBranch.indexOf(params.test) );
        } else if ( true ) {
            // Uses root port only for trie data
            const branch = params.traphBranch.split(",");
            const test = params.test.split(",");
            return branch[0] === test[0];
        } else {
            // No trie info, just find a path to the root
            return ( !isLeafwardNode(test) );
        }
    }
    function markBrokenBranches(params) {
        const traph = params.traph;
        const brokenBranch = params.brokenBranch;
        if ( brokenBranches.indexOf(brokenBranch) === -1 ) brokenBranches.push(brokenBranch);
        for ( const t in traph ) {
            traph[t].onBrokenBranch = false;
            brokenBranches.forEach(function(brokenBranch) {
                if ( sameBranch({"traphBranch":traph[t].branch,"test":brokenBranch}) ) traph[t].onBrokenBranch = true;
            });
        }
    }
    function getTraphByPortID(traph,portID) {
        for ( const t in traph ) {
            if ( traph[t].portID === portID ) return traph[t];
        }
        throw "No entry for portID " + portID;
    }
    function nextTrialParent(treeID,traph) {
        // Uncomment the one you want to use
        // return prunedLinksFirst(treeID,traph);
        // return nextSmallestHops(treeID,traph);
        return nextSmallestHopsBiasPruned(treeID,traph);
        // return nextSmallestHopsBiasPrunedUnbroken(treeID,traph);
    }
    function prunedLinksFirst(treeID,traph) {
        // First look for a pruned port not on the broken branch
        for ( let t = 1; i < traph.length; i++ ) {  // traph[0] is parent
            if ( traph[t].isConnected && !traph[t].isChild && !traph[t].onBrokenBranch &&
                 portUntried(treeID,traph[t].portID) ) return traph[t];
        }
        // If that fails, try a failover port on the broken branch
        for ( let t = 1; i < traph.length; i++ ) {
            if ( traph[t].isConnected && !traph[t].isChild && traph[t].onBrokenBranch &&
                 portUntried(treeID,traph[t].portID) ) return traph[t];
        }
        // If that fails, find a child to failover to
        for ( let t = 1; i < traph.length; i++ ) {
            if ( traph[t].isConnected && traph[t].isChild &&
                 portUntried(treeID,traph[t].portID) ) return trah[t];
        }
    }   
    function nextSmallestHops(treeID,traph) {
        let min; // No matter how big a number I pick, it won't be big enough!
        let minElement;
        Object.keys(traph).forEach(function(t) {
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
        Object.keys(traph).forEach(function(t) {
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
        Object.keys(traph).forEach(function(t) {
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
    function isLeafwardNode(treeID,brokenBranchID) {
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
}
