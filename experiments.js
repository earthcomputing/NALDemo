// Experiments to run from the console
'use strict';
// Break a link
let statistics; // Can't return a value from setTimeout
let aggregate = {};
function experiment(graph,fn,params) {
    const dc = build(graph);
    setTimeout(() => {
        dc.msgDelta();
        fn(dc,params);}, 0);
    setTimeout(() => getStats(dc), 0);
}
function disconnectLink(dc,linkID) {
    console.log("disconnect link " + linkID);
    const links = dc.getLinks();
    const link = links[linkID];
    link.disconnect();
}
function getStats(dc) {
    console.log("get stats");
    statistics = {"childCount":dc.childCount(),
                  "cellStats":dc.cellStats(),
                  "edgeCount":dc.edgeCount(),
                  "linkLength":dc.linkLength(),
                  "msgDelta":dc.msgDelta(),
                  "treeStats":dc.treeStats()};
}
let currentExperiment;
function experiments(exp) {
    const params = runs(exp);
    currentExperiment = params.description;
    aggregate = {};
    params.argList.forEach(function(e) {
        setTimeout(() => {
            experiment(params.grid,params.fn,e);
            setTimeout(() => {
                Object.keys(statistics).forEach(function(s) {
                    aggregate[s] = aggregate[s] || [];
                    aggregate[s].push(statistics[s]);})
                ,0});
        },0);
    });
    return params.description;
}
function aggregateStats() {
    const result = {"Experiment":currentExperiment};
    const collections = {};
    Object.keys(aggregate).forEach(function(m) {
        collections[m] = collections[m] || {};
        switch ( m ) {
        case "cellStats":
            collections[m] = {"assigned":[], "connected":[], "ports":[]};
            aggregate[m].forEach(function(a) {
                a.rawData.forEach(function(d) {
                    Object.keys(d).forEach(function(e){
                        collections[m][e].push(d[e]);
                    });
                });
            });
            result[m] = {"assigned":stats(collections[m].assigned),
                          "connected":stats(collections[m].connected),
                          "ports":stats(collections[m].ports)};
            break;
        case "childCount":
            collections[m].counts = [];
            result[m] = {"counts":{}};
            aggregate[m].forEach(function(a) {
                Object.keys(a.counts).forEach(function(i) {
                    collections[m].counts[i] = collections[m].counts[i] || [];
                    collections[m].counts[i].push(a.counts[i]);
                });
            });
            Object.keys(collections[m].counts).forEach(function(i) {
                result[m].counts[i] = stats(collections[m].counts[i]);
            });
            break;
        case "edgeCount":
            collections[m] = [];
            aggregate[m].forEach(function(a) {
                collections[m] = collections[m].concat(Object.values(a.rawData));
            });
            result[m] = stats(collections[m]);
            break;
        case "linkLength":
            collections[m] = [];
            aggregate[m].forEach(function(a) {
                collections[m] = collections[m].concat(a.rawData);
            });
            result[m] = stats(collections[m]);
            break;
        case "msgDelta":
            collections[m] = {};
            aggregate[m].forEach(function(a) {
                Object.keys(a).forEach(function(t) {
                    collections[m][t] = collections[m][t] || [];
                    collections[m][t].push(a[t]);
                });
            });
            result[m] = {};
            Object.keys(collections[m]).forEach(function(t) {
                result[m][t] = stats(collections[m][t]);
            });
            break;
        case "treeStats":
            collections[m] = [];
            aggregate[m].forEach(function(a) {
                collections[m] = collections[m].concat(a.rawData);
            });
            result[m] = stats(collections[m]);
            break;
        default:
            console.log("No statistics for " + m);
        }
    });
    return result;
}
function stats(values) {
    values.sort(function(a,b) { return a-b; });
    const med = median(values);
    const min = values[0];
    const max = values[values.length-1];
    const ave = values.reduce((a,b) => a + b, 0)/values.length;
    return {"min":min,"max":max,"average":ave,"median":med};
}
function statsOfStats(valuesList) {
    const result = {};
    const elements = Object.keys(valuesList[0]);
    elements.forEach(function(element) {
        const values = [];
        valuesList.forEach(function(v) {
            values.push(v[element]);
        });
        result[element] = stats(values);
    });
    return result;
}
function median(values) {
    values.sort(function(a,b) { return a-b; });
    return values[Math.floor(values.length/2)];
}
function gatherStats(statsObject) {
    if ( !statsObject ) {
        statsObject = {};
        metricFunctions.forEach(function(f) {
            statsObject[f] = [];
        });
    }
    metricFunctions.forEach(function(f) {
        statsObject[f].push(eval("dc." + f + "()"));
    });
    return statsObject;
};
function runs(exp) {
    const fn = disconnectLink;
    let grid;
    if ( exp.indexOf("4a") > -1 )      grid = "baranDistributedGrid";
    else if ( exp.indexOf("4b") >= 1 ) grid = "baranKleinbergGrid";
    else throw exp + " is invalid.";
    const linksToBreak = ["l-s","t-x","a-e","A-v","w-C","H-K","r-A","u-z","A-F","k-q"];
    const experiments = {
        "1a2a3a4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, full path info, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1a2b3a4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, root port only for path, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1a2c3a4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, no path info - walk to root, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1a2a3b4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, full path info, nextSmallestHops, failover to root"}, //
        "1a2b3b4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, root port only for path, nextSmallestHops, failover to root"}, //
        "1a2c3b4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, no path info - walk to root, nextSmallestHops, failover to root"}, //
        "1a2a3c4a5a":{"grid":grid,"fn":fn, "argList":linksToBreak,
            "description":grid + ", V^2 d discover, full path info, prunedLinksFirst, failover to root"}, //
        "1a2b3c4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, root port only for path, prunedLinksFirst, failover to root"}, //
        "1a2c3c4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, no path info - walk to root, prunedLinksFirst, failover to root"},
        "1a2a3a4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, full path info, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1a2b3a4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, root port only for path, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1a2c3a4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, no path info - walk to root, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1a2a3b4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, full path info, nextSmallestHops, failover to root"}, //
        "1a2b3b4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, root port only for path, nextSmallestHops, failover to root"}, //
        "1a2c3b4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, no path info - walk to root, nextSmallestHops, failover to root"}, //
        "1a2a3c4b5a":{"grid":grid,"fn":fn, "argList":linksToBreak,
            "description":grid + ", V^2 d discover, full path info, prunedLinksFirst, failover to root"}, //
        "1a2b3c4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, root port only for path, prunedLinksFirst, failover to root"}, //
        "1a2c3c4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d discover, no path info - walk to root, prunedLinksFirst, failover to root"},
        "1b2a3a4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, full path info, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1b2b3a4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, root port only for path, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1b2c3a4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, no path info - walk to root, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1b2a3b4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, full path info, nextSmallestHops, failover to root"}, //
        "1b2b3b4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, root port only for path, nextSmallestHops, failover to root"}, //
        "1b2c3b4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, no path info - walk to root, nextSmallestHops, failover to root"}, //
        "1b2a3c4a5a":{"grid":grid,"fn":fn, "argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, full path info, prunedLinksFirst, failover to root"}, //
        "1b2b3c4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, root port only for path, prunedLinksFirst, failover to root"}, //
        "1b2c3c4a5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, no path info - walk to root, prunedLinksFirst, failover to root"},
        "1b2a3a4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, full path info, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1b2b3a4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
                      "description":grid + ", V^2 d^2 discover, root port only for path, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1b2c3a4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, no path info - walk to root, nextSmallestHopsBiasedPruned, failover to root"}, //
        "1b2a3b4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, full path info, nextSmallestHops, failover to root"}, //
        "1b2b3b4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, root port only for path, nextSmallestHops, failover to root"}, //
        "1b2c3b4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, no path info - walk to root, nextSmallestHops, failover to root"}, //
        "1b2a3c4b5a":{"grid":grid,"fn":fn, "argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, full path info, prunedLinksFirst, failover to root"}, //
        "1b2b3c4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
            "description":grid + ", V^2 d^2 discover, root port only for path, prunedLinksFirst, failover to root"}, //
        "1b2c3c4b5a":{"grid":grid,"fn":fn,"argList":linksToBreak,
                      "description":grid + ", V^2 d^2 discover, no path info - walk to root, prunedLinksFirst, failover to root"},
        "1a2a3a4a5b":{"grid":grid,"fn":fn,"argList":linksToBreak,
                      "description":grid + ", V^2 d discover, full path info, pruned unbroken links first, failover to rootward"},
        "1a2c3a4a5b":{"grid":grid,"fn":fn,"argList":linksToBreak,
                      "description":grid + ", V^2 d discover, walk to RW, pruned unbroken links first, failover to rootward"},
    };
    Object.keys(experiments).forEach(function(e) {
        if ( experiments[e] ) experiments[e].description = e + ": " + experiments[e].description;
        else console.log(e + " is not a valid experiment");
    });
    if ( exp ) return experiments[exp];
    else       return experiments;
}
