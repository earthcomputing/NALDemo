/*---------------------------------------------------------------------------------------------
 *  Copyright © 2016-present Earth Computing Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
// Message
let countMsgs = 0;  // Used to debug message sends
const msgCounts = {"total":0};
let oldCounts = msgCounts;
function msgDelta() {
    const delta = {};
    Object.keys(msgCounts).forEach(function(m) {
        delta[m] = msgCounts[m] - (oldCounts[m] || 0);
    });
    oldCounts = clone(msgCounts);
    return delta;
}
var MsgFactory = function(typeVal) {
    const type = typeVal;
    msgCounts[type] = msgCounts[type] || 0;
    msgCounts[type]++;
    this.id = countMsgs++;  // Used for debugging
    msgCounts.total = countMsgs;
    let envelope = {};
    let letter = {};
    this.setLetter = function(msg) {
        letter = msg;
        envelope = {"msgID":this.id,"type":type, "letter":letter};
    };
    this.getEnvelope = function() { return envelope; };
    this.getMsgID = function() { return this.id; };
    this.getType = function() { return type; };
    this.getLetter = function() { return letter; };
    this.stringify = function() {
        return JSON.stringify(envelope); };
};
// Text Message {text}
this.TextMsg = function(txt) {
    MsgFactory.call(this,txt);
    const text = txt;
    const letter = {"text":text};
    this.setLetter(letter);
    delete this.setLetter;
    this.getText = function() { return text; };
    return Object.freeze(this);
};
// Send Buffer Empty Message {}
this.SendBufferEmptyMsg = function() {
    TextMsg.call(this,"sendEmpty");
    const text = "TreeMgr Empty Send Buffer";
};
// Recv Buffer Empty Message {}
this.RecvBufferEmptyMsg = function() {
    TextMsg.call(this,"recvEmpty");
    const text = "TreeMgr Empty Recv Buffer";
};
// Discover Message {sendingNodeID,treeID,hops,branch}
this.DiscoverMsg = function(params) {
    MsgFactory.call(this,"discover");
    const nodeID = params.sendingNodeID;
    const treeID = params.treeID;
    const hops = params.hops;
    const branch = clone(params.branch);
    const letter = {"sendingNode":nodeID,"treeID":treeID,"hops":hops,"branch":branch};
    // Discover msg always goes to TreeMgrSvc
    this.setLetter(letter);
    delete this.setLetter;
    this.getSendingNodeID = function() { return nodeID; };
    this.getTreeID = function() { return treeID; };
    this.getHops = function() { return hops; };
    this.getBranch = function() { return branch; };
    return Object.freeze(this);
};
// Discovered Message {treeID,sendingNodeID,hops,branch}
this.DiscoveredMsg = function(params) {
    MsgFactory.call(this,"discovered");
    const treeID = params.treeID;
    const nodeID = params.sendingNodeID;
    const hops = params.hops;
    const branch = params.branch;
    const letter = {"treeID":treeID,"hops":hops,"branch":branch};
    this.setLetter(letter);
    delete this.setLetter;
    this.getTreeID = function() { return treeID; };
    this.getHops = function() { return hops; };
    this.getBranch = function() { return branch; };
    this.getSendingNodeID = function() { return nodeID; };
    return Object.freeze(this);
};
// brokenLinkID needed to handle overlapping failover requests
// Failover Messasge {treeID,brokenLinkID,brokenBranch,brokenLinkIDs,treeIDs}
this.FailoverMsg = function(params) {
    MsgFactory.call(this,"failover");
    const treeID = params.treeID;
    const linkID = params.brokenLinkID;
    const branch = params.brokenBranch;
    const brokenLinkIDs = params.brokenLinkIDs; // Needed for experiment 5b, failover to RW
    const treeIDs = params.treeIDs;             // Needed for experiment 5b, failover to RW
    const letter = {"treeID":treeID,"brokenLinkID":linkID,"brokenBranch":branch,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs};
    this.setLetter(letter);
    delete this.setLetter;
    this.getTreeID = function() { return treeID; };
    this.getBrokenBranch = function() { return branch; };
    this.getBrokenLinkID = function() { return linkID; };
    this.getBrokenLinkIDs = function() { return brokenLinkIDs; };
    this.getTreeIDs = function() { return treeIDs; };
    return Object.freeze(this);
};
// FailoverStatus Message {treeID,brokenLinkID,status,branch,brokenBranch,brokenLinkIDs,treeIDs}
this.FailoverStatusMsg = function(params) {
    MsgFactory.call(this,"failoverStatus");
    const treeID = params.treeID;
    const linkID = params.brokenLinkID;
    const status = params.status;
    const branch = params.branch;
    const hops = params.hops;
    const brokenBranch = params.brokenBranch;
    const brokenLinkID = params.brokenLinkID;
    const brokenLinkIDs = params.brokenLinkIDs; // Needed for experiment 5b, failover to RW
    const treeIDs = params.treeIDs;             // Needed for experiment 5b, failover to RW
    const letter = {"treeID":treeID,"brokenLinkID":linkID,"status":status,"branch":branch,"hops":hops,"brokenBranch":brokenBranch,"brokenLinkIDs":brokenLinkIDs,"treeIDs":treeIDs};
    this.setLetter(letter);
    delete this.setLetter;
    this.getTreeID = function() { return treeID; };
    this.getStatus = function() { return status; };
    this.getBranch = function() { return branch; };
    this.getHops = function() { return hops; };
    this.getBrokenBranch = function() { return brokenBranch; };
    this.getBrokenLinkID = function() { return brokenLinkID; };
    this.getBrokenLinkIDs = function() { return brokenLinkIDs; };
    this.getTreeIDs = function() { return treeIDs; };
    return Object.freeze(this);
};
// Rediscover Message {treeID,brokenLinkID,sendingNode,hops,branch,brokenBranch,brokenBranches}
this.RediscoverMsg = function(params) {
    MsgFactory.call(this,"rediscover");
    const treeID = params.treeID;
    const linkID = params.linkID;
    const nodeID = params.sendingNodeID;
    const hops = params.hops;
    const branch = clone(params.branch);
    const brokenBranch = params.brokenBranch;
    const brokenBranches = params.brokenBranches;
    const brokenLinkID = params.brokenLinkID;
    const brokenLinkIDs = params.brokenLinkIDs;
    const letter = {"treeID":treeID,"brokenLinkID":linkID,"sendingNode":nodeID,"hops":hops,"branch":branch,"brokenBranch":brokenBranch,"brokenBranches":brokenBranches,"brokenLinkIDs":brokenLinkIDs};
    // Discover msg always goes to TreeMgrSvc
    this.setLetter(letter);
    delete this.setLetter;
    this.getSendingNodeID = function() { return nodeID; };
    this.getTreeID = function() { return treeID; };
    this.getHops = function() { return hops; };
    this.getBranch = function() { return branch; };
    this.getBrokenBranch = function() { return brokenBranch; };
    this.getBrokenBranches = function() { return brokenBranches; };
    this.getBrokenLinkID = function() { return brokenLinkID; };
    this.getBrokenLinkIDs = function() { return brokenLinkIDs; };
    return Object.freeze(this);
};
// Rediscovered Message {treeIDs,brokenLinkID,sendingNodeID,hops,branch,brokenBranch}
this.RediscoveredMsg = function(params) {
    MsgFactory.call(this,"rediscovered");
    const treeIDs = params.treeIDs;
    const linkID = params.linkID;
    const nodeID = params.sendingNodeID;
    const hops = params.hops;
    const branch = params.branch;
    const brokenBranch = params.brokenBranch;
    const letter = {"treeIDs":treeIDs,"brokenLinkID":linkID,"sendingNodeID":nodeID,"hops":hops,"branch":branch,"brokenBranch":brokenBranch};
    this.setLetter(letter);
    delete this.setLetter;
    this.getTreeIDs = function() { return treeIDs; };
    this.getHops = function() { return hops; };
    this.getBranch = function() { return branch; };
    this.getBrokenBranch = function() { return brokenBranch; };
    this.getSendingNodeID = function() { return nodeID; };
    return Object.freeze(this);
};
// Undiscovered Message {treeID,brokenLinkID}
this.UndiscoveredMsg = function(params) {
    MsgFactory.call(this,"undiscovered");
    const treeID = params.treeID;
    const linkID = params.brokenLinkID;
    const letter = {"treeID":treeID,"linkID":linkID};
    this.setLetter(letter);
    delete this.setLetter;
    this.getTreeID = function() { return treeID; };
    return Object.freeze(this);
};
