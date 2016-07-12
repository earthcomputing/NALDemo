// Message
let countMsgs = 0;  // Used to debug message sends
let msgCounts = {"total":0};
var MsgFactory = function(typeVal) {
    const type = typeVal;
    if ( !msgCounts[type] ) msgCounts[type] = 0;
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
// Text Message {text:text}
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
}
// Recv Buffer Empty Message {}
this.RecvBufferEmptyMsg = function() {
    TextMsg.call(this,"recvEmpty");
    const text = "TreeMgr Empty Recv Buffer";
}
// Discover Message {sendingNode:nodeID,treeID:rootNodeID,hops:hops,branch:branch}
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
// Discovered Message {treeID:rootNodeID,sendingNodeID:nodeID,branch:branch}
this.DiscoveredMsg = function(params) {
    MsgFactory.call(this,"discovered");
    const treeID = params.treeID;
    const nodeID = params.sendingNodeID;
    const branch = params.branch;
    const letter = {"treeID":treeID,"branch":branch};
    this.setLetter(letter);
    delete this.setLetter;
    this.getTreeID = function() { return treeID; };
    this.getBranch = function() { return branch; };
    this.getSendingNodeID = function() { return nodeID; };
    return Object.freeze(this);
};
// BranchInfo Message {treeID:treeID,newBranch:branch,brokenBranch:brokenBranch}
// Tells children their new branch
this.BranchInfoMsg = function(params) {
    MsgFactory.call(this,"branchInfo");
    const treeID = params.treeID;
    const branch = params.newBranch;
    const brokenBranch = params.brokenBranch;
    const letter = {"treeID":treeID,"newBranch":branch,"brokenBranch":brokenBranch};
    this.setLetter(letter);
    delete this.setLetter;
    this.getTreeID = function() { return treeID; };
    this.getNewBranch = function() { return branch; };
    this.getBrokenBranch = function() { return brokenBranch; };
    return Object.freeze(this);
};
// Failover Messasge {treeID:treeID,brokenBranch:branch}
// Tell node it has a new child after a failure
this.FailoverMsg = function(params) {
    MsgFactory.call(this,"failover");
    const treeID = params.treeID;
    const branch = params.brokenBranch;
    const letter = {"treeID":treeID,"brokenBranch":branch};
    this.setLetter(letter);
    delete this.setLetter;
    this.getTreeID = function() { return treeID; };
    this.getBrokenBranch = function() { return branch; };
    return Object.freeze(this);
};
// FailoverStatus Message {treeID:treeID,status:status,brokenBranch:brokenBranch}
// Tell failover requester I am its new parent
this.FailoverStatusMsg = function(params) {
    MsgFactory.call(this,"failoverStatus");
    const treeID = params.treeID;
    const status = params.status;
    const brokenBranch = params.brokenBranch;
    const letter = {"treeID":treeID,"status":status,"brokenBranch":brokenBranch};
    this.setLetter(letter);
    delete this.setLetter;
    this.getTreeID = function() { return treeID; };
    this.getStatus = function() { return status; };
    this.getBrokenBranch = function() { return brokenBranch; };
    return Object.freeze(this);
};
