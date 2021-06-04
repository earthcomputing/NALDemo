// Experiment naming convention explained in Section 10 of
//  ~/Dropbox (Earth Computing)/Earth Computing Team Folder/Architecture/Tree Building and Healing/Tree Building and Healing AHK.pdf
'use strict';
// Start of code for experiment
if ( !currentExperiment ) currentExperiment = '1a2a3a4a5a'; // Baseline options
/*---------------------------------------------------------------------------------------------
 *  Copyright © 2016-present Earth Computing Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var TreeMgrSvc = function(params) {
    const MAXTRIES = 0;  // No retries because not dealing with overlapping failures
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
    const seenRootPorts = {};
    const brokenBranches = []; // Need to reset when a link reconnects
    let brokenLinkIDs = []; // For fail to RW; a cheat unless nodes have unique IDs
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
        const firstHop = getFirstStep(branch);
        if ( !traph[0] ) {
            const discoveredMsg = new DiscoveredMsg({"treeID":treeID,"sendingNodeID":nodeID,
                                                     "hops":hops,"branch":branch});
            const reply = {"port":portID,"target":defaultSvcID,"envelope":discoveredMsg};
            debugOutput("Discovered: " + svc.getLabel() + portID + " " + discoveredMsg.stringify());
            svc.send(reply);
            forward(ports);
            seenRootPorts[treeID] = initArray(seenRootPorts[treeID]);
            seenRootPorts[treeID].push(firstHop);
        } else if ( isExperiment("1b") ) { // EXP - Slow quenching
            if ( seenRootPorts[treeID].indexOf(firstHop) < 0 ) {
                seenRootPorts[treeID].push(firstHop);
                forward(ports);
            }
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
                        //let trieData = pID;
                        //if ( link ) trieData = link.getID();
                        const trieData = iffun([[link,()=> {return link.getID();}]]);
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
    if ( isExperiment("5a") ) { // EXP - failover to root
        this.portDisconnected = function(portID,brokenNodeIDs) {
            for ( const treeID in traphs ) {
                if ( brokenNodeIDs && brokenNodeIDs.indexOf(treeID) > -1 ) continue;
                const traph = traphs[treeID];
                const parentLinkFailed = (traph[0].portID === portID);
                let connected = false;
                let brokenBranch;
                let brokenLinkID;
                BREAKPOINT(eval(breakpointTest),"portDisconnected: tree " + treeID + " node " + svc.getNodeID());
                if ( parentLinkFailed ) {
                    brokenBranch = adjustPath(traph[0]);
                    brokenLinkID = traph[0].linkID;
                }
                for ( const p in traph ) { 
                    if ( traph[p].portID === portID ) {
                        traph[p].isConnected = false;
                        if ( parentLinkFailed ) {
                            failoverRequester[treeID] = initObject(failoverRequester[treeID]);
                            failoverRequester[treeID][brokenLinkID] = initArray(failoverRequester[treeID][brokenLinkID]);
                            failoverRequester[treeID][brokenLinkID].push(portID);
                        }
                        else traph[p].isChild = false;
                    }
                    if ( traph[p].isConnected ) connected = true;
                }
                if ( connected ) {
                    if ( parentLinkFailed && !node.isBroken() && treeID !== nodeID ) {
                        findNewParent({"treeID":treeID, "traph":traph,"brokenLinkID":brokenLinkID, "brokenBranch":brokenBranch,"treeIDs":[treeID]});
                    }
                } else console.log("Network partition: Cell " + nodeID + " has no connected ports");
            }
        }
    } else if ( isExperiment("5b") ) { // EXP - failover to RW
        this.portDisconnected = function(portID,brokenNodeIDs) {
            const treeID = getTraphByPortID(Object.values(traphs)[1],portID).nodeID;
            BREAKPOINT(eval(breakpointTest),"portDisconnected: tree " + treeID + " node " + svc.getNodeID());
            const traph = traphs[treeID];
            if ( traph[0].portID === portID ) {
                const brokenLinkID = traph[0].linkID;
                if ( brokenLinkIDs.indexOf(brokenLinkID) < 0 ) brokenLinkIDs.push(brokenLinkID);
                const firstStep = getFirstStep(traph[0].branch);
                if ( brokenLinkIDs.indexOf(firstStep) < 0 ) brokenLinkIDs.push(firstStep);
            }
            const treeIDs = [];
            Object.values(traphs).forEach(function(traph) {
                if ( traph[0].portID === portID ) treeIDs.push(traph[0].treeID);
                const traphToUpdate = getTraphByPortID(traph,portID);
                traphToUpdate.isChild = false;
                traphToUpdate.isConnected = false;
            });
            const brokenBranch = traph[0].branch;
            const brokenLinkID = traph[0].linkID;
            if ( !node.isBroken() ) findNewParent({"treeID":treeID,"traph":traph,"brokenLinkID":brokenLinkID,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs});
        }
    } else {
        throw "Experiment " + currentExperiment + " not implemented."
    }
    function findNewParent(params) {
        const treeID = params.treeID;
        const traph = params.traph;
        const brokenBranch = params.brokenBranch;
        const brokenLinkID = params.brokenLinkID;
        const brokenLinkIDs = params.brokenLinkIDs; // Needed for experiment 5b
        const treeIDs = params.treeIDs;             // Needed for experiment 5b
        portsTried[treeID] = initArray(portsTried[treeID]);
        if ( portsTried[treeID].length === 0 ) portsTried[treeID].push(0); // First element is count of attempts
        BREAKPOINT(eval(breakpointTest), "findNewParent: tree " + treeID + " node " + svc.getNodeID());
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        const trialParent = nextTrialParent(treeID,traph);
        if ( !trialParent.onBrokenBranch ) {
            failoverSuccess({"treeID":treeID,"traph":traph,"branch":traph[0].branch,"brokenLinkID":brokenLinkID,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs});
                const oldParentPortID = traph[0].portID;
                treeIDs.forEach(function(t) {
                    const traph = traphs[t];
                    const home = iffun([[!traph[0].portID,()=> {return traph.shift();}]]);
                    //if ( !traph[0].portID ) home = traph.shift();
                    sendToFrontByPortID(traph,trialParent.portID);
                    if ( !isExperiment("2c") ) sendPathUpdate({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch,"brokenBranches":brokenBranches,"brokenLinkIDs":brokenLinkIDs});
                    traph[0].isChild = false;
                    if ( home ) traphs[t].unshift(home);
                });
            informNewParent({"treeIDs":treeIDs,"traph":traph,"hops":trialParent.hops,"branch":trialParent.branch,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs});
            return;
        }
        // Reject if walk to RW path goes through root; fails if only paths are through root
        const is5b = isExperiment("5b");
        if ( trialParent && !is5b || trialParent && (is5b && treeIDs.indexOf(trialParent.nodeID) < 0) ) failover(trialParent);
        else {
            failoverFailure({"treeID":treeID,"traph":traph,"branch":traph[0].branch,"brokenLinkID":brokenLinkID,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs});
        }
        function failover(trialParent) {
            const failoverMsg = new FailoverMsg({"treeID":treeID,"brokenLinkID":brokenLinkID,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs});
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
        const brokenLinkIDs = value.envelope.getBrokenLinkIDs(); // Needed for experiment 5b
        const treeIDs = value.envelope.getTreeIDs();             // Needed for experiment 5b
        const myID = svc.getNodeID();
        const traph = traphs[treeID];
        const failoverParams = {"treeID":treeID,"traph":traph,"branch":traph[0].branch,"brokenLinkID":brokenLinkID,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs};
        const newParentParams = {"treeID":treeID, "traph":traph,"brokenLinkID":brokenLinkID, "brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs};
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
        //let test;
        //if ( isExperiment("2c") ) test = treeID === myID;  // EXP - Walk all the way to the root
        //else if ( isExperiment("5b") ) test = !pathHasBrokenLink(traph[0].branch,brokenLinkIDs);  // EXP - Failover to RW
        //else test = traph[0].portID !== portID && (treeID === myID || (!traph[0].onBrokenBranch && traph[0].isConnected));
        const test = iffun([[isExperiment("2c"),(p)=>{return treeID === myID;}],
                            [isExperiment("5b"),(p)=>{return !pathHasBrokenLink(traph[0].branch,brokenLinkIDs);}],
                            [true,(p)=>{return traph[0].portID !== portID && (treeID === myID || (!traph[0].onBrokenBranch && traph[0].isConnected));}]]); 
        if ( test ) {
            //let branch = traph[0].branch;
            //if ( treeID === myID ) branch = rootPath(portID);
            const branch = iffun([[treeID === myID,()=>{return rootPath(portID);}]]);
            if ( isExperiment("5b") ) { // EXP - failover to RW
                const newParent = traph[0];
                getKeys(traphs).forEach(function(t) { 
                    const traph = traphs[t];
                    if ( pathHasBrokenLink(traph[0].branch,brokenLinkIDs) ) {
                        sendToFrontByPortID(traph,newParent.portID);
                    }
                });
                if ( treeID !== myID ) informNewParent({"treeIDs":treeIDs,"traph":traph,"hops":newParent.hops,"branch":newParent.branch,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs});
            }
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
        const brokenLinkIDs = params.brokenLinkIDs;
        const treeIDs = params.treeIDs;
        BREAKPOINT(eval(breakpointTest),"failoverStatus: tree " + treeID + " node " + svc.getNodeID());
        // I am the leafward node if I don't have any requesters
        getKeys(failoverRequester[treeID]).forEach(function(brokenLinkID){
            const p = getFailoverPort({"treeID":treeID,"brokenLinkID":brokenLinkID});
            const t = getTraphByPortID(traph,p);
            if ( t.isConnected ) {
                const linkID = getLinkIDFromPortID(traph,p);
                const failoverStatusMsg = new FailoverStatusMsg({"treeID":treeID,"brokenLinkID":brokenLinkID,"status":status,"branch":appendToBranch(branch,linkID),"hops":traph[0].hops+1,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs});
                svc.send({"port":p,"target":defaultSvcID,"envelope":failoverStatusMsg});
                debugOutput("Failover " + status + ": " + svc.getLabel() + linkID + " " + failoverStatusMsg.stringify());
            }
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
        const brokenLinkIDs = value.envelope.getBrokenLinkIDs();
        const treeIDs = value.envelope.getTreeIDs();
        const status = value.envelope.getStatus();
        const myID = svc.getNodeID();
        const traph = traphs[treeID];
        const failoverParams = {"treeID":treeID,"traph":traph,"branch":branch,"brokenBranch":brokenBranch,"brokenLinkID":brokenLinkID,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs};
        BREAKPOINT(eval(breakpointTest),"failoverStatusHandler: tree " + treeID + " node " + svc.getNodeID());
        debugOutput("Failover Status Handler: " + svc.getLabel() + "portID " + portID + " " + value.envelope.stringify());
        if ( status === FAILOVERSUCCESS ) {
            if ( isExperiment("5a") ) { // EXP - failover to root
                markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
                const newParent = getTraphByPortID(traph,portID);
                const oldParent = traph[0];
                if ( oldParent.onBrokenBranch && (branch === newParent.branch || !isOnBranch({"longer":branch,"shorter":newParent.branch})) ) {
                    debugOutput("Tree Update: " + oldParent.nodeID + " " + traph[0].nodeID);
                    sendToFrontByPortID(traph,portID);
                    sendPathUpdate({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch});
                    if ( oldParent.isConnected ) { // Tell my old parent to remove me as a child
                        const undiscoveredMsg = new UndiscoveredMsg({"treeID":treeID});
                        svc.send({"port":oldParent.portID,"target":defaultSvcID,"envelope":undiscoveredMsg});
                        debugOutput("Inform old parent: " + svc.getLabel() + "old parent " + oldParent.nodeID + " " + undiscoveredMsg.stringify());
                    }
                    informNewParent({"treeIDs":[treeID],"traph":traph,"hops":hops,"branch":branch,"brokenBranch":brokenBranch});
                }
            } else if ( isExperiment("5b") ) { // EXP - failover to RW
                const oldParentPortID = traph[0].portID;
                treeIDs.forEach(function(t) {
                    const traph = traphs[t];
                    const home = iffun([[!traph[0].portID,(traph)=>{return traph.shift()},traph]]);
                    //if ( !traph[0].portID ) home = traph.shift();
                    sendToFrontByPortID(traph,portID);
                    if ( !isExperiment("2c") ) sendPathUpdate({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch,"brokenBranches":brokenBranches,"brokenLinkIDs":brokenLinkIDs});
                    traph[0].isChild = false;
                    if ( home ) traphs[t].unshift(home);
                });
                informNewParent({"treeIDs":treeIDs,"traph":traph,"hops":hops,"branch":branch,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs});
            } else {
                throw "Experiment " + currentExperiment + " not implemented.";
            }
            failoverSuccess(failoverParams);
            delete portsTried[treeID];
        } else {
            findNewParent({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch, "brokenLinkID":brokenLinkID,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs});
        } 
    }
    function informNewParent(params) {
        const treeIDs = params.treeIDs;
        const traph = params.traph;
        const hops = params.hops;
        const branch = params.branch;
        const brokenBranch = params.brokenBranch;
        const brokenLinkIDs = params.brokenLinkIDs;
        const myID = svc.getNodeID();
        //BREAKPOINT(eval(breakpointTest),"informNewParent: tree " + treeID + " node " + svc.getNodeID());
        traph[0].isChild = false;
        traph[0].branch = branch;
        traph[0].hops = hops;
        traph[0].onBrokenBranch = false;
        // Tell my new parent to add me as a child
        const rediscoveredMsg = new RediscoveredMsg(
            {"treeIDs":treeIDs,"hops":traph[0].hops,"sendingNodeID":myID,
             "branch":traph[0].branch,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs});
        debugOutput("Inform new parent: " + svc.getLabel() + "new parent " + traph[0].nodeID + " " + rediscoveredMsg.stringify());
        svc.send({"port":traph[0].portID,"target":defaultSvcID,"envelope":rediscoveredMsg});
    }
    function sendPathUpdate(params) {
        const treeID = params.treeID;
        const traph = params.traph;
        const brokenBranch = params.brokenBranch;
        const brokenBranches = params.brokenBranches;
        const brokenLinkIDs = params.brokenLinkIDs;
        const myID = svc.getNodeID()
        //BREAKPOINT(eval(breakpointTest),"sendPathUpdate: tree " + treeID + " node " + myID + " hops " + traph[0].hops + " branch " + traph[0].branch);
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        // Tell my neighbors on broken branch about new branch info
        for ( let t = 0; t < traph.length; t++ ) { 
            if ( traph[t].isConnected ) {
                const pathData = traph[t].linkID;
                //let newBranch = appendToBranch(traph[0].branch,pathData);
                //if ( t === 0 ) newBranch = traph[0].branch;
                const newBranch = iffun([[t === 0,()=>{return traph[0].branch;}],
                                         [true,   ()=>{return appendToBranch(traph[0].branch,pathData);}]]);
                const rediscoverMsg = new RediscoverMsg(
                    {"sendingNodeID":svc.getNodeID(),"treeID":treeID,"hops":traph[0].hops+1,"branch":newBranch,
                     "brokenBranch":brokenBranch,"brokenBranches":brokenBranches,"brokenLinkIDs":brokenLinkIDs});
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
        const newBrokenLinkIDs = envelope.getBrokenLinkIDs();
        const traph = traphs[treeID];
        const sender = getTraphByPortID(traph,portID).nodeID;
        //BREAKPOINT(eval(breakpointTest), "rediscoverHandler: tree " + treeID + " node " + svc.getNodeID() + " " + portID);
        markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
        debugOutput("Rediscover Handler: " + svc.getLabel() + portID + " " + sender + " " + envelope.stringify());
        const traphToUpdate = getTraphByPortID(traph,portID);
        if ( isExperiment("5b") ) { // EXP - failover to RW
            brokenLinkIDs = brokenLinkIDs.concat(newBrokenLinkIDs.filter(function(item){
                return brokenLinkIDs.indexOf(item) < 0;
            }));
        }
        if ( isOnBrokenBranch(branch) || !traphToUpdate.onBrokenBranch ||
             isOnBranch({"longer":branch,"shorter":traphToUpdate.branch}) ) return;
        checkForCycle(branch);
        traphToUpdate.hops = hops;
        traphToUpdate.branch = branch;
        traphToUpdate.onBrokenBranch = false;
        // Forward message on all ports on the broken branch if message is from my parent
        if ( newParentPortID[treeID] === portID ||
             !newParentPortID[treeID] && traph[0].portID === portID ) {
            if ( !isExperiment("5b") ) sendPathUpdate({"treeID":treeID,"traph":traph,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs});
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
        const treeIDs = value.envelope.getTreeIDs();
        const hops = value.envelope.getHops();
        const brokenBranch = value.envelope.getBrokenBranch();
        const sendingNodeID = value.envelope.getSendingNodeID();
        const branch = value.envelope.getBranch();
        //BREAKPOINT(eval(breakpointTest), "rediscoveredHandler: trees " + treeIDs + " node " + svc.getNodeID() + " " + portID);
        treeIDs.forEach(function(treeID) {
            const traph = traphs[treeID];
            markBrokenBranches({"traph":traph,"brokenBranch":brokenBranch});
            const traphToUpdate = getTraphByPortID(traphs[treeID],portID);
            traphToUpdate.branch = branch;
            traphToUpdate.hops = hops;
            traphToUpdate.isChild = true;
            traphToUpdate.onBrokenBranch = false;
        });
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
    function isExperiment(experiment) {
        return currentExperiment.indexOf(experiment) > -1;
    }
    function pathHasBrokenLink(path,brokenLinkIDs) {
        let found = false;
        if ( path ) {
            const array = path.split(",");
            brokenLinkIDs.forEach(function(brokenLinkID) {
                found = found || array.indexOf(brokenLinkID) > -1;
            });
        }
        return found;
    }
    function isOnBranch(params) {
        // EXP - Root port only
        if ( isExperiment("2a") ) {
            // Uses full path info
            return 0 === params.longer.indexOf(params.shorter);
        } else if ( isExperiment("2b") ) {
            // Uses root port only for path data
            return getFirstStep(params.longer) === getFirstStep(params.shorter);
        } else if ( isExperiment("2c") ) {
            return false;
        } else {
            // No path info, just find a path to the root
            // Generate an error for now
            throw "isOnBranch: Case not implemented";
        }
    }
    function getFirstStep(path) {
        const a = path.split(",");
        return a[0];
    }
    function markBrokenBranches(params) {
        const traph = params.traph;
        const brokenBranch = params.brokenBranch;
        // Must remember broken branches for next failure
        if ( brokenBranches.indexOf(brokenBranch) === -1 ) {
            portsTried[traph[0].treeID] = [0]; // Clear on seeing new broken branch
            brokenBranches.push(brokenBranch);
        }
        for ( const t in traph ) {
            // Don't use remembered broken branches if using only root port info
            if ( isExperiment("1b") ) {
                traph[t].onBrokenBranch = isOnBranch({"longer":traph[t].branch,"shorter":brokenBranch});
            }
            else traph[t].onBrokenBranch = isOnBrokenBranch(traph[t].branch);
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
        // EXP
        //let trialParent;
        const untriedPorts = untried(traph,treeID);
        const notParent = nonParent(untriedPorts,traph[0].portID);
        //let filtered;
        //if ( isExperiment("2c") ) filtered = connected(untriedPorts); 
        //else                      filtered = connected(notParent);
        const filtered = iffun([[isExperiment("2c"),()=>{return connected(untriedPorts);}],
                                [true,              ()=>{return connected(notParent);}]]);
        //if ( isExperiment("3a") ) trialParent = smallestHopsPrunedUnbroken(filtered); 
        //else if ( isExperiment("3b") ) trialParent = nextSmallestHops(filtered);
        //else if ( isExperiment("3c") ) trialParent = prunedLinksFirst(filtered);
        //else throw currentExperiment + " is not valid";
        const trialParent = iffun([[isExperiment("3a"),()=>{return smallestHopsPrunedUnbroken(filtered);}],
                                   [isExperiment("3b"),()=>{return nextSmallestHops(filtered);}],
                                   [isExperiment("3c"),()=>{return prunedLinksFirst(filtered);}],
                                   [true,              ()=>{throw currentExperiment + " is not valid";}]]);
        //let trialParent = prunedLinksFirst(treeID,traph);
        //let trialParent = unbrokenPrunedLinksFirst(treeID,traph);
        //let trialParent = nextSmallestHops(treeID,traph);
        //let trialParent = nextSmallestHopsBiasPruned(treeID,traph);
        // let trialParent = nextSmallestHopsBiasPrunedUnbroken(treeID,traph);
        // Never use current parent as trial parent - Not needed except for EXP 2a - failover to RW
        if ( isExperiment("2b") && trialParent && trialParent.portID === traph[0].portID ) {
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
    function smallestHopsPrunedUnbroken(traph) {
        const prunedTraph = pruned(traph);
        const minHops = smallestHops(prunedTraph); 
        const unbrokenTraph = unbroken(minHops);
        return unbrokenTraph.concat(prunedTraph,children(traph))[0];
    }
    function prunedLinksFirst(traph) {
        const childrenTraph = children(traph);
        const prunedTraph = pruned(traph);
        return prunedTraph.concat(childrenTraph)[0];
    }   
    function unbrokenPrunedLinksFirst(traph) {
        const childrenTraph = children(traph);
        const prunedTraph = pruned(traph);
        const unbrokenTraph = unbroken(prunedTraph);
        return unbrokentTraph.concat(prunedTraph,childrenTraph);
    }   
    function nextSmallestHopsBiasPruned(traph) {
        const minHops = smallestHops(traph);
        const prunedTraph = pruned(minHops);
        return prunedTraph.concat(minHops);
    }
    function nonParent(traph,portID) {
        if ( traph[0].portID === portID ) return traph.slice(1);
        else                              return traph;
    }
    function untried(traph,treeID) { return traph.filter(function(x) {
        return portsTried[treeID].indexOf(x.portID) < 0;
    });}
    function connected(traph) { return traph.filter(function(x) { return x.isConnected; });}
    function pruned(traph) { return traph.filter(function(x){ return !x.isChild; });}
    function unbroken(traph) { return traph.filter(function(x){ return !x.onBrokenBranch; });}
    function children(traph) { return traph.filter(function(x){ return x.isChild; });}
    function smallestHops(traph) {
        let min;
        let minHopTraphs = [];
        if ( traph.length === 0 ) return minHopTraphs;
        Object.values(traph).forEach(function(element) {
            if ( min && element.hops === min ) minHopTraphs.push(element);
            if ( element.isConnected && !min || element.hops < min ) {
                min = element.hops;
                minHopTraphs = [element];
            }
        });
        return minHopTraphs;
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
        const array = branch.split(",");
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
    function brokenPath(branch) {
        let result;
        const links = branch.split(',');
        Object.keys(links).forEach(function(link) {
            if ( dataCenter.brokenLinks[links[link]] ) result = branch;
        });
        return result;
    }
    function brokenTreePaths(treeID) {
        const result = [];
        const nodes = dataCenter.getNodes();
        Object.keys(nodes).forEach(function(nodeID) {
            const traph = getTraph(nodeID,treeID);
            Object.keys(traph).forEach(function(t) {
                if ( traph[t].isConnected ) {
                    const found = brokenPath(traph[t].branch);
                    if ( found ) result.push(traph[t]);
                }
            });
        });
        return result;
    }
    function brokenPaths() {
        let result = [];
        const nodes = dataCenter.getNodes();
        Object.keys(nodes).forEach(function(nodeID) {
            Object.keys(nodes).forEach(function(treeID) {
                const traph = getTraph(nodeID,treeID);
                Object.keys(traph).forEach(function(t) {
                    if ( traph[t].isConnected ) {
                        const found = brokenPath(traph[t].branch);
                        if ( found ) result.push(traph[t]);
                    }
                });
            });
        });
        return result;
    }
}
