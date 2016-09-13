'use strict';
/*
  Discovery: Each node contructs a tree with itself at the root by
  flooding the network.  The each node will eventually see a request
  from this root on each of its ports.  The first will be used to
  construct the tree.  Subsequent discovery messages from a given root
  will be recorded for recovery in case the primary link fails.  The
  order in which nodes appear in the tree is stochastic.  The
  procedure continues until there has been one outgoing message on
  each port for each tree.  (By symmetry, that means there is one
  incoming message on each port.)  We ignore messages directed to the
  root node.

  Topology for Example

         |            |            |
     +---U---+    +---U---+    +---U---+
     |       | 0  |       | 1  |       |
  ---L   0   R----L   1   R----L   2   R---
     |       |    |       |    |       |
     +---D---+    +---D---+    +---D---+
         |            |            |   
         | 4          | 5          | 6
         |            |            |
     +---U---+    +---U---+    +---U---+
     |       | 2  |       | 3  |       |
  ---L   3   R----L   4   R----L   5   R---
     |       |    |       |    |       |
     +---D---+    +---D---+    +---D---+
         |            |            |
*/
// Utility Functions - nalutility.js
// Messages - nalmsgs.js
// Service - nalservice.js
// Tree Manager Service - naltreemgr.js

// Some constants used for debugging
let dataCenter; // So I can see things from the console
// Start of actual code
var DataCenterFactory = function(blueprint){ 
    const nodes = {};
    const links = {};
    let edgeList = {};
    this.edgeCount = {};
    this.brokenLinks = {};
    let trees;
    const nodeIDs = new IDFactory({prefix:"N:","isGUID":blueprint.useGUIDs});
    const linkIDs = new IDFactory({prefix:"L:","isGUID":blueprint.useGUIDs});
    const svcIDs  = new IDFactory({prefix:"S:","isGUID":blueprint.useGUIDs});
    const dc = this;
    function createDataCenter() {
        const attrsNode = nodeDisplayParams.attrs;
        const radius = attrsNode.r;
        const offsetX = attrsNode.offsetX;
        const offsetY = attrsNode.offsetY;
        const xscale = nodeDisplayParams.attrs.xscale;
        const yscale = nodeDisplayParams.attrs.yscale;
        const nnodes = blueprint.nodes.length;
        for ( let n = 0; n < nnodes; n++ ) {
            let nodeID;
            if ( blueprint.nodes[n] ) {
                attrsNode.cx = xscale*radius*blueprint.nodes[n].x;
                attrsNode.cy = yscale*radius*blueprint.nodes[n].y;
                nodeID = blueprint.nodes[n].name;
            } else {
                const xy = getNodePosition(
                    {"i":n,"nnodes":nnodes,
                     "offsetX":offsetX+radius,"offsetY":offsetY+radius});
                attrsNode.cx = Math.round(xscale*xy.x);
                attrsNode.cy = Math.round(yscale*xy.y);
                nodeID = nodeIDs.getID();
            }
            const node = new NodeFactory(
                {"id":nodeID,"nports":blueprint.nports,
                 "display":cloneDisplayParams(nodeDisplayParams)});
            // TreeMgr service always svcID = defaultID
            debugOutput("Add TreeMgrSvc to " + nodeID);
            const svc = node.addService({"constructor":TreeMgrSvc,
                                         "svcID":defaultSvcID});
            svc.start();
            nodes[nodeID] = node;
        }
        console.log("-----> Wire ports to links");
        if ( !blueprint.links ) {
            blueprint.links = [];
            let i = 0;
            for ( const n1 in nodes ) {
                const attrs1 = nodes[n1].getDisplayAttrs();
                const x1 = attrs1.cx;
                const y1 = attrs1.cy;
                let j = 0;
                for ( const n2 in nodes ) {
                    const attrs2 = nodes[n2].getDisplayAttrs();
                    const x2 = attrs2.cx;
                    const y2 = attrs2.cy;
                    if ( x1 === x2 && (y1-y2 === 100*yscale) ||
                         y1 === y2 && (x1-x2 === 100*xscale) ) blueprint.links.push([i,j]);
                    j++;
                }
                i++;
            }
            if ( blueprint.addKleinberg ) blueprint.links.concat(getKleinbergLinks());
        }
        for ( const wire in blueprint.links ) dc.addLink(blueprint.links[wire]); 
        console.log("-----> Data Center Wired");
        setTimeout(buildTrees,0);
        function getNodePosition(params) {
            const i = params.i;
            const nnodes = params.nnodes;
            const offsetX = params.offsetX;
            const offsetY = params.offsetY;
            const ncols = Math.min(blueprint.maxCols,Math.floor(Math.sqrt(nnodes)));
            const x = offsetX + 100*(i - ncols*Math.trunc(i/ncols));
            const y = offsetY + 100*Math.trunc(i/ncols);
            return {"x":x,"y":y};
        }
        function getKleinbergLinks() {
            const ncols = Math.min(blueprint.maxCols,Math.floor(Math.sqrt(nnodes)));
            const nrows = nodeIDs.length/ncols;
            const n1 =   ncols/4 +   nrows/4;
            const n2 =   ncols/4 + 3*nrows/4;
            const n3 = 3*ncols/4 +   nrows/4;
            const n4 = 3*ncols/4 + 3*nrows/4;
            return [[n1,n4],[n2,n3]];
        }
    }
    this.configuration = function() {
        const configuration = {};
        const links = dc.getLinks();
        for ( let l in links ) {
            const link = links[l];
            const ports = link.getPorts();
            if ( ports.L ) {
                configuration[link.getID()] =
                    [ports.L.getNodeID(),ports.R.getNodeID()];
            }
        }
        console.log("Data Center Configuration - {link:[leftNode,rightNode]}");
        console.log(JSON.stringify(configuration));
        return configuration;
    };
    this.addLink = function(wire) {
        let n0, n1, linkID;
        if ( wire.name ) {
            n0 = nodes[wire.nodeIDs[0]];
            n1 = nodes[wire.nodeIDs[1]];
            linkID = wire.name;
        } else {
            n0 = nodes[idFromIndex(nodes,wire[0])];
            n1 = nodes[idFromIndex(nodes,wire[1])];
            linkID = linkIDs.getID();
        }
        const p0 = n0.getFreePort();
        const p1 = n1.getFreePort();
        let xy = n0.getDisplayAttrs();
        linkDisplayParams.attrs.x1 = xy.cx;
        linkDisplayParams.attrs.y1 = xy.cy;
        xy = n1.getDisplayAttrs();
        linkDisplayParams.attrs.x2 = xy.cx;
        linkDisplayParams.attrs.y2 = xy.cy;
        const cloned = cloneDisplayParams(linkDisplayParams);
        const link = new LinkFactory({"id":linkID,"Lport":p0,"Rport":p1,"display":cloned});
        links[linkID] = link;
    };
    function idFromIndex(object,index) {
        const keys = Object.keys(object);
        return keys[index];
    }
    this.addNode = function(connections) {
        const wires = [];
        const nodeID = nodeIDs.getID();
        connections.forEach(function(connection) {
            wires.push([nodeID,connection]);
        });
        const cloned = cloneDisplayParams(nodeDisplayParams);
        const node = new NodeFactory({"id":nodeID,"nports":blueprint.nportsPerNode,cloned});
        wires.forEach(this.addLink);
    };
    this.disconnect = function(linkID) { links[linkID].disconnect(); };
    this.crashNode = function(nodeID) { nodes[nodeID].crash(); };
    this.getNodes = function(){ return nodes; };
    this.getLinks = function(){ return links; };
    this.getTree = function(nodeID) { return trees[nodeID]; };
    this.setTrees = function(edgeList) { trees = edgeList; };
    this.getEdgeList = function() {
        return JSON.stringify(edgeList); };
    const nodesDisplay = {};        
    this.showConfiguration = function(changes) {
        for ( let link in links ) { links[link].show(changes); }
        for ( let node in nodes ) { nodes[node].show(changes); }
    };
    this.treeStats = function() {
        let numTrees;
        let maxHops = 0;
        let totalHops = 0;        
        const nodeIDs = Object.keys(nodes);
        const numNodes = nodeIDs.length;
        nodeIDs.forEach(function(nodeID) {
            if ( !nodes[nodeID].isBroken() ) {
                let services = nodes[nodeID].getServices();
                let svc = services[defaultSvcID];
                let traphs = svc.getTraphs();
                const treeIDs = Object.keys(traphs);
                numTrees = treeIDs.length;
                treeIDs.forEach(function(treeID) {
                    if ( traphs[treeID][0].isConnected && nodeID !== treeID &&
                         !nodes[treeID].isBroken() ) {
                        const hops = traphs[treeID][0].hops;
                        totalHops = totalHops + hops;
                        if ( hops > maxHops ) maxHops = hops;
                    }
                });
            }
        });
        return {"maxHops":maxHops, "averageHops":totalHops/(numNodes*numTrees)};
    };            
    function buildTrees() {
        edgeList = {};
        Object.keys(dc.edgeCount).forEach(function(linkID) { dc.edgeCount[linkID] = 0; });
        for ( const nodeID in nodes ) {
            let services = nodes[nodeID].getServices();
            let svc = services[defaultSvcID];
            let traphs = svc.getTraphs();
            for ( const treeID in traphs ) {
                const traph = traphs[treeID];
                if ( nodeID !== treeID && traph[0].isConnected ) {
                    const linkID = traph[0].linkID;
                    edgeList[treeID] = edgeList[treeID] || [];
                    dc.edgeCount[linkID] = dc.edgeCount[linkID] || 0;
                    const nID = traph[0].nodeID;
                    const newEdge = [nodeID,linkID,nID];
                    if ( !inEdgeList(edgeList[treeID],newEdge) ) {
                        edgeList[treeID].push(newEdge);
                        dc.edgeCount[linkID]++;
                    }
                }
            }
        }
        dc.setTrees(edgeList);
        return edgeList;
        function inEdgeList(edges,newEdge) { // Edge not already in tree
            for ( const edge in edges ) {
                if ( edges[edge][1] === newEdge[1] ) return true;
            }
            return false;
        }
    }
    this.showTree = function(treeID) {
        this.showConfiguration({"tree":false,"root":false});
        if ( !treeID ) return;
        const tree = buildTrees()[treeID];
        for ( let edge in tree ) {
            const n1 = nodes[tree[edge][0]];
            const n2 = nodes[tree[edge][2]];
            const link = links[tree[edge][1]];
            n1.show({"tree":true});
            n2.show({"tree":true});
            let xy1 = n1.getDisplayAttrs();
            let xy2 = n2.getDisplayAttrs();
            link.show({"tree":true},{"x1":xy1.cx,"y1":xy1.cy,"x2":xy2.cx,"y2":xy2.cy});
        }
        nodes[treeID].show({"root":true});
    }
    console.log("-----> Make nodes");
    // Needed because clone uses JSON.stringify which loses functions
    function cloneDisplayParams(params) {
        const cloned = clone(params);
        for ( let e in params.eventData ) {
            cloned.eventData[e] = params.eventData[e];
        }
        return cloned;
    }
    function countPorts(nodeID) {
        let count = 0;
        for ( const link in blueprint.links ) {
            if ( blueprint.links[link].source === nodeID ) count++;
            if ( blueprint.links[link].target === nodeID ) count++;
        }
        return count
    }
    createDataCenter();
    this.breakLinks = function(linkIDsToBreak) {
        linkIDsToBreak.forEach(function(linkID) {
            setTimeout(function(linKID) {
                links[linkID].disconnect();
            }, 0);
        });
    }
    var publicFns = this;
    // Generate unique IDs for physical resources - nodes, links
    function IDFactory(params) {
        const prefix = params.prefix || "";
        let currentID = 0;
        this.getID = function() {
            if ( params.isGUIDs ) return (params.prefix || "") + UUID.generate();
            else                  return (params.prefix || "") + currentID++;
        };
        const publicFns = this;
        return Object.freeze(publicFns);
    }
    function Displayable(params) {
        let that = this;
        const shape = params.shape;
        const classList = params.classes;
        const eventData = params.eventData;
        const attrs = params.attrs;
        const defaultClass = "default";
        const classes = {};
        for ( let c in classList ) {
            if ( c === defaultClass ) classes[classList[c]] = true;
            else                      classes[classList[c]] = false;
        }
        this.delay = params.eventData.delay;
        this.timer = null;
        this.display = d3.select("svg")
            .insert(params.shape,params.before)
            .classed(classes);
        this.getDisplayAttrs = function() { return attrs; };
        this.display.on("mouseover",mouseOver);
        this.display.on("mouseleave",mouseLeave);
        function getLabelPosition(element) {
            // Following puts tooltip on the left side of the d3 canvas
            const pos = document.getElementById("viz-container").getBoundingClientRect();
            const x = pos.left;
            const y = pos.top;
            const adjx = 0;
            const adjy = 50;
            return [x+adjx,y+adjy];
        };
        function mouseOver() {
            if ( blueprint.tooltips ) d3.select("#tooltip").style("display","block");
            const xy = getLabelPosition(this);
            //d3.select("#tooltip").style("left",xy[0]+"px").style("top",xy[1]+"px").html(that.getID());
            d3.select("#tooltip").html(that.getID()); // Fixed position relative to screen
        }
        this.clicked = function() {
            //console.log("mouseOver: " + isReset);
            if ( that.delay ) {
                showTree = that.getID();
                that.timer = setTimeout(function() {
                    dc.showTree(showTree); }, that.delay);
            }
        }
        function mouseLeave() {
            if ( that.delay ) clearTimeout(that.timer);
            d3.select("#tooltip").style("display","none");
            //dc.showConfiguration({"tree":false,"root":false}); 
        }
        that.show = function(classChanges,attrChanges) {
            if ( !attrChanges ) showAttr(attrs);
            showAttr(attrChanges);
            if ( classChanges ) {
                for ( let c in classChanges ) {
                    classes[classList[c]] = classChanges[c];
                }
            } else {
                for ( let c in classList ) {
                    if ( c !== defaultClass ) classes[classList[c]] = false;
                }
            }
            setTimeout(function() { that.display.classed(classes); }, 0);
        };
        function showAttr(attrs) {
            for ( let a in attrs ) {
                that.display.attr(a,attrs[a]);
            }
            that.display.attr("name",that.getID());
        }
    }
    // Link
    function LinkFactory(params) {
        Displayable.call(this,params.display);
        let that = this;
        let broken = false;
        const id = params.id;
        dc.brokenLinks[id] = false;
        this.isBroken = function() { return broken; };
        this.display.on("dblclick",toggleBroken);
        // No free port => bad wiring diagram
        const ports = {"L":params.Lport,"R":params.Rport};
        const transmitPromises = {};
        const portReadyPromises = {};
        const matchResolvers = {"L":makeResolver(),"R":makeResolver()};
        const linkAckResolvers = {"L":makeResolver(),"R":makeResolver()};
        const receiveResolvers = {"L":makeResolver(),"R":makeResolver()};
        let promises = ports.L.setLink({"link":this,
                                    "linkAckPromise":linkAckResolvers.L.promise,
                                    "receivePromise":receiveResolvers.L.promise});
        transmitPromises.L = promises.transmitPromise;
        portReadyPromises.L = promises.portReadyPromise;
        promises = ports.R.setLink({"link":this,
                                    "linkAckPromise":linkAckResolvers.R.promise,
                                    "receivePromise":receiveResolvers.R.promise});
        transmitPromises.R = promises.transmitPromise;
        portReadyPromises.R = promises.portReadyPromise;
        entangle();
        function label(port) {
            return "Link " + id + " " + port.getNodeID() + " " + port.getID() + ": ";
        }
        function entangle() {
            // Only works for one service per node
            debugOutput("Entangle LR: " + label(ports.L) + " " + label(ports.R));
            matchPromises("L","R");
            matchPromises("R","L");
            function matchPromises(t,r) {
                waitOnPortReady(t,r);
                waitOnMatch(t,r);
            } 
            function waitOnPortReady(t,r) {
                debugOutput("Wait on Port Ready " + r + ": " + label(ports[r]) + "Promise " + portReadyPromises[r].id);
                portReadyPromises[r].then(function(value){
                    const svcID = value.target;
                    debugOutput("Port Ready: " + label(ports[r]) + "Promise " + portReadyPromises[r].id + " Resolve " + matchResolvers[r].id);
                    const promise = value.promise;
                    const resolver = makeResolver();
                    debugOutput("Link Ack Resolve: " + label(ports[r]) + "Resolve " + linkAckResolvers[t].id);
                    value.promise = resolver.promise;
                    linkAckResolvers[t].fulfill(value);
                    linkAckResolvers[t] = resolver;
                    matchResolvers[r].fulfill({"matchResolver":makeResolver()});
                    portReadyPromises[r] = promise;
                    waitOnPortReady(t,r);
                });
            }
            function waitOnMatch(t,r) {
                debugOutput("Wait on Transmit: " + label(ports[t]) + "Promises " + transmitPromises[t].id + ", " + matchResolvers[r].id);
                Promise.all([transmitPromises[t],matchResolvers[r].promise]).then(function(values) {
                    const envelope = values[0].envelope;
                    const promise = values[0].promise;
                    const resolver = makeResolver();
                    debugOutput("Transmit: " + label(ports[t]) + "Promises " + transmitPromises[t].id + ", " + matchResolvers[r].id + " Resolve " + receiveResolvers[r].id + " " + envelope.stringify());
                    BREAKPOINT(matchResolvers[r].id === 16093,"match resolver 16093");
                    if ( !that.isBroken() ) {
                        values[0].promise = resolver.promise;
                        receiveResolvers[r].fulfill(values[0]);
                        receiveResolvers[r] = resolver;
                    }
                    transmitPromises[t] = promise;
                    matchResolvers[r] = values[1].matchResolver;
                    waitOnMatch(t,r);
                });
            }
        }
        function entangle2() {
            // Handles multiple services per node if each service has a unique name
            let matchResolvers = {};
            debugOutput("Entangle LR: " + label(ports.L) + " " + label(ports.R));
            matchPromises("L","R");
            matchPromises("R","L");
            function matchPromises(t,r) {
                matchTransmit(t,r);
                matchPortReady(t,r);
            }
            var resolvedMatchers = {};
            function matchPortReady(t,r) {
                debugOutput("Wait on Port Ready: " + label(ports[r]) + portReadyPromises[r].id);
                portReadyPromises[r].then(function(value){
                    const svcID = value.target;
                    const matcher = matcherString(svcID,r);
                    debugOutput("Port Ready: " + label(ports[r]) + svcID + " Promise " + portReadyPromises[r].id);
                    const promise = value.promise;
                    const resolver = makeResolver();
                    debugOutput("Link Ack Resolve: " + label(ports[r]) + "Resolve " + linkAckResolvers[t].id);
                    value.promise = resolver.promise;
                    linkAckResolvers[t].fulfill(value);
                    linkAckResolvers[t] = resolver;
                    // One per link no matter how many services
                    matchResolvers[matcher] = matchResolvers[matcher] || makeResolver();
                    resolvedMatchers[matcher] = false;
                    debugOutput("Match Ready: " + label(ports[r]) + "Promise " + matchResolvers[matcher].id);
                    matchResolvers[matcher].promise.then(function(value) {
                        const matcher = matcherString(svcID,r);
                        resolvedMatchers[matcher] = value.envelope;
                        debugOutput("Match Ready Resolved: " + label(ports[r]) + "Promise " + matchResolvers[matcher].id + " " + value.envelope.stringify());
                        if ( value.target !== svcID ) throw "Promise mismatch";
                        const resolver = makeResolver();
                        value.promise = resolver.promise;
                        debugOutput("Match Ready resolve receive: " + label(ports[r]) + "svc " + svcID + " Resolve " + receiveResolvers[r].id);
                        receiveResolvers[r].fulfill(value);
                        receiveResolvers[r] = resolver;
                        matchResolvers[matcher] = makeResolver();
                    });
                    portReadyPromises[r] = promise;
                    matchPortReady(t,r);
                },rejected);
            }
            function matchTransmit(t,r) {
                debugOutput("Wait on Transmit: " + label(ports[t]) + "Promise " + transmitPromises[t].id);
                transmitPromises[t].then(function(value) {
                    const svcID = value.target;
                    const envelope = value.envelope;
                    const promise = value.promise;
                    const matcher = matcherString(svcID,r);
                    // Don't transmit on broken link - Need to do something when link is fixed
                    if ( !that.isBroken() ) {
                        debugOutput("Transmit: " + label(ports[t]) + "Promise " + transmitPromises[t].id + " " + envelope.stringify());
                        if ( !matchResolvers[matcher] ) {
                            console.log("Error: Port not ready for svc " + svcID);
                            matchResolvers[matcher] = makeResolver();
                        }
                        debugOutput("Match Transmit resolve: " + label(ports[t]) + " Resolve " + matchResolvers[matcher].id);
                        // A hack to take care of sending multiple messages on one port
                        if ( false && resolvedMatchers[matcher] ) {
                            debugOutput("Previously matched old: " + label(ports[t]) + matcher + " " + resolvedMatchers[matcher].stringify());
                            debugOutput("Previously matched new: " + label(ports[t]) + matcher + " " + value.envelope.stringify());
                            receiveResolvers[r].fulfill(value);
                            receiveResolvers[r] = makeResolver();
                            resolvedMatchers[matcher] = false;
                        } else {
                            matchResolvers[matcher].fulfill(value);
                        }
                    }
                    transmitPromises[t] = promise;
                    matchTransmit(t,r);
                },rejected);
            }
            function matcherString(svcID,r) {
                return svcID + ports[r].getNodeID();
            }
        }
        this.getID = function() { return id; };
        this.getPorts = function(){ return ports; };
        function toggleBroken() {
            // Test is backward because called method will toggle value
            if ( broken ) that.reconnect();
            else          that.disconnect();
        }
        this.disconnect = function() {
            if ( !broken ) { // Needed to end recursion with port.disconnect()
                console.log("Disconnect link: " + id);
                dc.brokenLinks[id] = true; // To debug bad trie updates
                broken = true;
                ports.L.disconnect();
                ports.R.disconnect();
                that.show({"broken":broken});
                setTimeout(function() { dc.showTree(showTree); }, 0);            }
        };
        this.reconnect = function() {
            // Commented out until I implement port reconnect
            //broken = true;
            //if ( ports.L.isConnected() && ports.R.isConnected() ) broken = false;
            broken = false; // Needed until I implement port reconnect
            dc.brokenLinks[id] = false; // To debug bad trie updates
            that.show({"broken":broken});
            console.log("Reconnect link: " + id);
        };
        const publicFns = this;
        return Object.freeze(publicFns);
    }
    // Node
    function NodeFactory(params) {
        Displayable.call(this,params.display);
        let that = this;
        let broken = false;
        const id = params.id;
        const nports = params.nports;
        const label = id + " ";
        const ports = {};
        const services = {};
        let clickTimer;
        this.display.on("click",that.clicked);
        this.display.on("dblclick",function() {
            //alert("Killing a node has not been debugged.");
            //return;
            clearTimeout(that.timer);
            broken = !broken;
            that.show({"broken":broken});
            if ( broken ) that.crash();
            else          console.log("Start node " + that.getID());//that.restart();
        });        
        this.getID = function() { return id; };
        this.isBroken = function() { return broken; };
        this.portDisconnected = function(portID) {
            services[defaultSvcID].portDisconnected(portID);
        };
        for ( let p = 1; p <= nports; p++ ) { // Reserve port 0 for loop-back
            const port = new PortFactory({"node":this,"id":"P:" + p});
            ports[port.getID()] = port;
        }
        // Add a new service on this node
        this.addService = function(params) {
            const svcID = params.svcID;
            const Constructor = params.constructor;
            const sendPromises = {};
            const deliverPromises = {};
            const fillResolvers = {};
            const emptyRecvResolvers = {};
            const facet = {"getID":this.getID,
                           "getPorts":this.getPorts,
                           "isBroken":this.isBroken,
                           "getNports":this.getNports};
            for ( let i in ports ) {
                let p = ports[i].getID();
                fillResolvers[p] = makeResolver();
                emptyRecvResolvers[p] = makeResolver();
                const params1 = {"svcID":svcID,
                                 "node":facet,
                                 "empty":emptyRecvResolvers[p].promise,
                                 "fill":fillResolvers[p].promise};
                let promises = ports[p].addService(params1);
                sendPromises[p] = promises.send;
                deliverPromises[p] = promises.deliver;
            }
            const params2 = {"svcID":svcID,"node":facet,
                       "fill":fillResolvers,
                       "send":sendPromises,
                       "deliver":deliverPromises,
                       "empty":emptyRecvResolvers};
            const svc = new Constructor(params2);
            services[svc.getID()] = svc;
            debugOutput("New Service: " + svc.getType() + " " + label + svc.getLabel());
            return svc;
        };
        this.removeService = function(service) {
            service.stop();
            // Some other stuff
        };
        this.getFreePort = function() {
            for ( let p in ports) {
                if ( !ports[p].isAssigned() ) {
                    ports[p].assignPort();
                    return ports[p];
                }
            }
            throw "Bad wiring list at node: " + id;
        };
        // Emulate a node crash
        this.crash = function() {
            broken = true;
            for ( let p in ports ) {
                ports[p].disconnect();
            }
            for ( let s in services ) { services[s].stop(); }
        };
        this.restart = function() {
            broken = false;
            for ( let p in ports ) {
                ports[p].reconnect();  // Discovered?
            }
            for ( let s in services ) {
                services[s].start();  // Discover?
            }
        };
        this.getNports = function() { return nports; };
        this.getPorts = function() { return ports; };
        this.getServices = function() { return services; };
        let publicFns = this;
        // Port Factory
        function PortFactory(params) {
            const port = this;
            const id = params.id;
            const node = params.node;
            let label = id + " " + node.getID() +" ";
            var assigned = false;
            var connected = false;
            var link;
            const sendBuffers = {};
            const recvBuffers = {};
            let transmitResolver = makeResolver();
            let readyResolver = makeResolver();
            const sendResolvers = {};
            const fillPromises = {};
            const deliverResolvers = {};
            let emptySendResolver = makeResolver();
            const emptyRecvPromises = {};
            let linkAckPromise;
            let receivePromise;
            this.getSendBuffers = function() { return sendBuffers; };
            this.getRecvBuffers = function() { return recvBuffers; };
            function waitOnRecvEmpty(promise) {
                debugOutput("Wait on Recv Empty: " + label + " Promise " + promise.id);
                promise.then(function(value) {
                    debugOutput("Recv Empty: " + label + "Promise " + promise.id);
                    const svcID = value.target;
                    const nextPromise = value.promise;
                    const resolver = makeResolver();
                    const envelope = value.envelope;
                    value.promise = resolver.promise;
                    debugOutput("Port ready resolve: " + label + "Resolve " + readyResolver.id);
                    readyResolver.fulfill(value);
                    readyResolver = resolver;
                    emptyRecvPromises[svcID] = promise;
                    waitOnRecvEmpty(nextPromise);
                },rejected);
            }
            function waitOnAck() {
                debugOutput("Port Wait on Ack: " + label + linkAckPromise.id);
                linkAckPromise.then(function(value) {
                    const svcID = value.target;
                    debugOutput("Link Ack: " + label + svcID + " Promise " + linkAckPromise.id);
                    const promise = value.promise;
                    const resolver = makeResolver();
                    value.promise = resolver.promise;
                    debugOutput("Empty send resolve: " + label + svcID + " Resolve " + emptySendResolver.id);
                    emptySendResolver.fulfill(value);
                    emptySendResolver = resolver;
                    linkAckPromise = promise;
                    waitOnAck();
                },rejected);
            }
            this.setLink = function(params){ // Set once until broken
                if ( link ) throw "Bad wiring diagram: " + label + "link already set";
                link = params.link;
                linkAckPromise = params.linkAckPromise;
                receivePromise = params.receivePromise;
                assigned = true;
                connected = true;
                waitOnRecv();
                waitOnAck();
                return {"transmitPromise":transmitResolver.promise,
                        "portReadyPromise":readyResolver.promise};
            };
            this.addService = function(params) {
                const svcID = params.svcID;
                fillPromises[svcID] = params.fill;
                emptyRecvPromises[svcID] = params.empty;
                sendResolvers[svcID] = makeResolver();
                sendBuffers[svcID] = new SendBuffer({
                    "id":id,
                    "label":label,
                    "svcID":svcID,
                    "send":sendResolvers[svcID],
                    "empty":emptySendResolver.promise,
                    "transmit":transmitResolver,
                    "fill":fillPromises[svcID]});
                deliverResolvers[svcID] = makeResolver();
                recvBuffers[svcID] = new RecvBuffer({
                    "id":id,
                    "label":label,
                    "svcID":svcID,
                    "deliver":deliverResolvers[svcID].promise,
                    "receive":receivePromise,
                    "empty":emptyRecvPromises[svcID]});
                waitOnRecvEmpty(emptyRecvPromises[svcID]);
                return {"send":sendResolvers[svcID].promise,
                        "deliver":deliverResolvers[svcID].promise};
            };
            function waitOnRecv() {
                debugOutput("Port Wait on Recv: " + label + receivePromise.id);
                receivePromise.then(function(value) {
                    const svcID = value.target;
                    const envelope = value.envelope;
                    const promise = value.promise;
                    debugOutput("Receive resolve: " + label + "Promise " + receivePromise.id + " Resolve " + deliverResolvers[svcID].id + " " + envelope.stringify());
                    const resolver = makeResolver();
                    value.promise = resolver.promise;
                    value.portID = id;
                    deliverResolvers[svcID].fulfill(value);
                    deliverResolvers[svcID] = resolver;
                    receivePromise = promise;
                    waitOnRecv();
                },rejected);
            }
            this.disconnect = function() {
                if ( connected ) {
                    link.disconnect();
                    node.portDisconnected(id);
                }
                assigned = false;
                connected = false;
            };
            this.reconnect = function() {
                if ( !connected ) link.reconnect();
                connected = true;
            };
            this.unsetLink = function() {
                link = null;
                assigned = false;
                connected = false;
                // Fill in after I figure out what I need to do
                //disconnectedResolver.fulfill(id);
            };
            this.getID = function() { return id; };
            this.getNodeID = function() { return node.getID(); };
            this.isAssigned = function() { return assigned; };
            this.assignPort = function() { assigned = true; };
            this.isConnected = function() { return connected; };
            this.getLink = function() { return link; };
            const publicFns = this;
            // Buffer
            var BufferFactory = function(params) {
                const id = params.id;
                const svcID = params.svcID;
                const nodeLabel = params.label;
                const defaultContents = new TextMsg("default");
                const initialContents = new TextMsg("initial");
                let contents = defaultContents;
                this.getID = function() { return id; };
                this.getSvcID = function() { return svcID; };
                this.getContents = function() { return contents; };
                this.setContents = function(value) {
                    if ( !value && value !== "" ) debugOutput("Buffer Contents Undefined");
                    contents = value;
                };
                this.getDefaultContents = function() { return defaultContents; };
                this.getLabel = function() {return nodeLabel + svcID + " "; };
            };
            // Send Buffer
            var SendBuffer = function(params) {
                BufferFactory.call(this,params);
                const buffer = this;
                const svcID = this.getSvcID();
                const label = "Send Buffer " + this.getLabel();
                let emptyPromise = params.empty;
                let sendResolver = params.send;
                let transmitResolver = params.transmit;
                let fillPromise = params.fill;
                waitOnFill();
                waitOnEmpty();
                function waitOnFill() {
                    debugOutput("Send Wait on Fill: " + label + "Promise " + fillPromise.id);
                    fillPromise.then(function(value) {
                        const svcID = value.target;
                        const envelope = value.envelope;
                        const promise = value.promise;
                        debugOutput("Send Fill: " + label + "Promise " + fillPromise.id + " Resolve " + transmitResolver.id + " " + envelope.stringify());
                        if ( buffer.getContents() === buffer.getDefaultContents() ) {
                            const resolver = makeResolver();
                            value.promise = resolver.promise;
                            transmitResolver.fulfill(value);
                            transmitResolver = resolver;
                            // Empty promise can fire after next send, so empty on transmit
                            buffer.setContents(buffer.getDefaultContents());
                        } else {
                            // Currently can't happen since buffer is emptied immediately
                            debugOutput("Fill Wait on Fill: " + label + " Promise " + fillPromise.id + " " + envelope.stringify());
                            console.error("Filling a filled buffer " + buffer.getContents().envelope.stringify());
                        }
                        fillPromise = promise;
                        waitOnFill();
                    },rejected);
                }
                function waitOnEmpty() {
                    debugOutput("Send Wait on Empty: " + label + "Promise " + emptyPromise.id);
                    emptyPromise.then(function(value) {
                        debugOutput("Send Empty resolved: " + label + "Promise " + emptyPromise.id + " " + svcID);
                        const promise = value.promise;
                        let resolver = makeResolver();
                        value.promise = resolver.promise;
                        debugOutput("Send resolve: " + label + "Promise " + emptyPromise.id + " Resolve " + sendResolver.id);
                        // Might happen while an unsent msg is in the buffer
                        if ( buffer.getContents() !== buffer.getDefaultContents() )
                            buffer.setContents(buffer.getDefaultContents());
                        value.portID = buffer.getID();
                        sendResolver.fulfill(value);
                        sendResolver = resolver;
                        resolver = makeResolver();
                        emptyPromise = promise;
                        waitOnEmpty();
                    },rejected);
                }
                const myPublicFns = this;
                return Object.freeze(myPublicFns);
            };
            var RecvBuffer = function(params) {
                BufferFactory.call(this,params);
                const buffer = this;
                const id = params.id;
                const svcID = params.svcID;
                const label = "Recv Buffer " + this.getLabel();
                let deliverPromise = params.deliver;
                let emptyPromise = params.empty;
                waitOnEmpty();
                waitOnDeliver();
                function waitOnEmpty() {
                    debugOutput("Recv Wait on Empty: " + label + "Promise " + emptyPromise.id);
                    emptyPromise.then(function(value){
                        debugOutput("Recv Buffer Empty: " + label + "Promise " + emptyPromise.id);
                        const promise = value.promise;
                        buffer.setContents(buffer.getDefaultContents());
                        emptyPromise = promise;
                        waitOnEmpty();
                    },rejected);
                }
                function waitOnDeliver() {
                    debugOutput("Recv Wait on Deliver: " + label + "Promise " + deliverPromise.id);
                    deliverPromise.then(function(value) {
                        const svcID = value.target;
                        const envelope = value.envelope;
                        const promise = value.promise;
                        debugOutput("Recv Delivered: " + label + "Promise " + deliverPromise.id + " " + envelope.stringify());
                        buffer.setContents(envelope);
                        deliverPromise = promise;
                        waitOnDeliver();
                    },rejected);
                }
                const myPublicFns = this;
                return Object.freeze(myPublicFns);
            };
            return Object.freeze(publicFns);
        }
        //return Object.freeze(publicFns);
    }
    return Object.freeze(publicFns);
};
