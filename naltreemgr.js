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
    this.getTreeID = function() { return nodeID; }
    this.getTraphs = function() { return traphs; };
    this.start = function() {
        svc.startSuper();
        for ( let p in svc.getPorts() ) {
            const discoverMsg = new DiscoverMsg({"sendingNodeID":nodeID,"treeID":nodeID,"hops":0,"branch":p});
            const letter = {"port":p,"target":defaultSvcID,"envelope":discoverMsg};
            debugOutput("Send start " + svc.getLabel() + p + " " + letter.envelope.stringify());
            svc.send(letter);
        }
    };
    function discoverHandler(value) {
        const portID = value.portID;
        const envelope = value.envelope;
        debugOutput("Discover Delivered " + svc.getLabel() + portID + " " + envelope.stringify());
        // Ignore message if I am the root of the tree
        if ( nodeID === envelope.getLetter().treeID ) return;
        const sendingNodeID = value.envelope.getSendingNodeID();
        const treeID = envelope.getTreeID();
        const msg = envelope.getLetter();
        const hops = msg.hops + 1;
        const branch = envelope.getBranch();
        const ports = svc.getPorts()
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
        debugOutput("TreeMgrSvc add " + svc.getLabel() + JSON.stringify(traphUpdate));
        debugOutput("TreeMgrSvc traphs " + svc.getLabel() + JSON.stringify(traphs[treeID][0]));
        function forward(ports) {
            // Forward message on all ports except the one it came in on
            for ( const pID in ports ) {
                if ( pID !== portID ) {
                    const discoverMsg = new DiscoverMsg({"sendingNodeID":svc.getNodeID(),"treeID":treeID,"hops":hops,"branch":branch + "," + pID});
                    const letter = {"port":pID,"target":defaultSvcID,"envelope":discoverMsg};
                    debugOutput("Forward Discover " + svc.getLabel() + pID + " " + letter.envelope.stringify());
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
        debugOutput("Discovered Handler " + svc.getLabel() + "treeID " + treeID + " child " + portID);
    }
    function updateTraph(params) {
        const traph = params.traph;
        const update = params.update;
        const portID = params.portID;
        let updated = false;
        for ( p in traph ) {
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
            let brokenBranch = "broken"; // Any string that never matches a branch
            for ( const p in traph ) { 
                if ( traph[p].portID === portID ) {
                    traph[p].isConnected = false;
                    traph[p].isChild = false;
                    brokenBranch = traph[p].branch;
                }
                if ( traph[p].isConnected && !connected ) connected = true;
            };
            if ( !connected ) console.error("Network partition: Cell " + svc.getNodeID() + " has no connected ports");
            else {
                const oldParent = traph[0];
                if ( parentLinkFailed && treeID !== svc.getNodeID() ) {
                    findNewParent({"portID":portID, "myID":nodeID,
                                   "treeID":treeID, "traph":traph,
                                   "brokenBranch":brokenBranch, "oldParent":oldParent});
                }
                else portsTried[treeID] = [];
            }
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
        for ( let i = 1; i < traph.length; i++ ) {  // Current parent is traph[0]
            if ( traph[i].isConnected && !traph[i].isChild &&
                 !sameBranch(brokenBranch,traph[i].branch) ) {
                // Assumes branch information updated following earlier failures
                portsTried[treeID] = [];
                sendToFront(traph,i);
                traph[0].isChild = false;
                // Tell my new parent to add me as a child
                const discoveredMsg = new DiscoveredMsg({"treeID":treeID,"sendingNodeID":myID,
                                                         "branch":traph[0].branch + traph[0].portID});
                svc.send({"port":traph[0].portID,"target":defaultSvcID,"envelope":discoveredMsg});
                debugOutput("Inform new parent (nonchild) " + svc.getLabel() + "new parent " + traph[0].nodeID + " " + discoveredMsg.stringify());
                // Tell my non-parent ports to update their branch info
                sendBranchInfo({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch});
                // Tell my old parent that I found a new parent
                failoverSuccess({"treeID":treeID,"oldParent":oldParent,"brokenBranch":brokenBranch});
                return;
            }
        }
        // If that fails, find a child to failover to
        for ( let i = 1; i < traph.length; i++ ) {
            if ( traph[i].isConnected && traph[i].isChild ) {
                if ( failover(traph[i]) ) return;
            }
        }
        // If that fails, try to failover to a port on the broken branch
        for ( let i = 1; i < traph.length; i++ ) {
            if ( traph[i].isConnected && !traph[i].isChild &&
                 sameBranch(brokenBranch,traph[i].branch) ) {
                if ( failover(traph[i]) ) return;
            }
        }
        // If that fails, there's no failover branch from this node
        if ( oldParent.isConnected ) {
            const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"status":false,
                                                             "brokenBranch":brokenBranch});
            svc.send({"port":oldParent.portID,"target":defaultSvcID,"envelope":failoverStatusMsg});
            debugOutput("No failover " + svc.getLabel() + "old parent " + traph[0].nodeID + " " + failoverStatusMsg.stringify());
        } else console.error("Network partition: Cell " + svc.getNodeID() + " found no path to root " + treeID);
        function failover(trialParent) {
            if ( !trialParent.isConnected ||
                 portsTried[treeID].indexOf(trialParent.portID) >= 0 ) return false; 
            const failoverMsg = new FailoverMsg({"treeID":treeID,"brokenBranch":brokenBranch});
            svc.send({"port":trialParent.portID,"target":defaultSvcID,"envelope":failoverMsg});
            debugOutput("Failover " + svc.getLabel() + "port " + trialParent.portID + " " + failoverMsg.stringify());
            portsTried[treeID].push(trialParent.portID);
            return true;
        }
    }
    function failoverSuccess(params) {
        const treeID = params.treeID;
        const oldParent = params.oldParent;
        const brokenBranch = params.brokenBranch;
        oldParent.isChild = true;
        if ( oldParent.isConnected ) {
            const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"status":true,"brokenBranch":brokenBranch});
            svc.send({"port":oldParent.portID,"target":defaultSvcID,"envelope":failoverStatusMsg});
            debugOutput("Failover to child " + svc.getLabel() + "port " + oldParent.portID + " " + failoverStatusMsg.stringify());
        } else {
            debugOutput("Parent not connected " + svc.getLabel() + "treeID " + treeID + " port " + oldParent.portID);
        }
    }
    function sameBranch(traphBranch,branch) {
        return ( 0 === branch.indexOf(traphBranch) ||
                 0 === traphBranch.indexOf(branch) );
    }
    function failoverHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const branch = value.envelope.getBrokenBranch();
        const traph = svc.getTraphs()[treeID];
        debugOutput("Failover Handler " + svc.getLabel() + "treeID " + treeID + " old parent " + traph[0].nodeID + " brokenBranch " + branch);
        findNewParent({"portID":portID,"treeID":treeID, "traph":traph,"myID":svc.getNodeID(),
                       "brokenBranch":branch, "oldParent":traph[0]});
    }
    function failoverStatusHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const brokenBranch = value.envelope.getBrokenBranch();
        const isAccepted = value.envelope.getStatus();
        const traph = svc.getTraphs()[treeID];
        debugOutput("Failover Status Handler " + svc.getLabel() + "portID " + portID + " " + value.envelope.stringify());
        if ( isAccepted ) {
            const oldParent = traph[0];
            oldParent.isChild = true;
            sendToFrontByPortID(traph,portID);
            traph[0].isChild = false;
            portsTried[treeID] = [];
            sendBranchInfo({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch});
            failoverSuccess({"treeID":treeID,"oldParent":oldParent,"brokenBranch":brokenBranch});
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
        const brokenBranch = params.brokenBranch;
        for ( let t = 1; t < traph.length; t++ ) {  // traph[0] points to parent
            if ( traph[t].isConnected && sameBranch(traph[t].branch,brokenBranch) ) {
                const portID = traph[t].portID;
                const branchInfoMsg = new BranchInfoMsg({"treeID":treeID,"newBranch":traph[0].branch + "," + portID,"brokenBranch":brokenBranch});
                const letter = {"port":portID,"target":defaultSvcID,"envelope":branchInfoMsg};
                debugOutput("Send Branch Info " + svc.getLabel() + "port " + portID + " " + letter.envelope.stringify());
                svc.send(letter);
            }
        }
    }
    // Testing a change
    function branchInfoHandler(value) {
        const portID = value.portID;
        const treeID = value.envelope.getTreeID();
        const branch = value.envelope.getNewBranch();
        const brokenBranch = value.envelope.getBrokenBranch();
        debugOutput("Branch Info Handler " + svc.getLabel() + "treeID " + treeID + " new branch " + branch);
        const traph = svc.getTraphs()[treeID];
        for ( const p in traph ) {
            if ( traph[p].portID === portID && sameBranch(traph[p].branch,brokenBranch) ) {
                traph[p].branch = branch;
                sendBranchInfo({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch});
            }
        }
    }
}
