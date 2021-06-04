/*---------------------------------------------------------------------------------------------
 *  Copyright © 2016-present Earth Computing Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
// Messages to build datacenter
const experimentBuildMsg = {};
experimentBuildMsg.baran = {"description":"V^2 d discover, Baran Distributed Grid","total":14382,"default":564,"initial":564,"discover":11092,"discovered":2162};
experimentBuildMsg.kleinberg = {"total":14382,"default":564,"initial":564,"discover":11092,"discovered":2162};

const results = {};
results["1a2a3a4a5a"] = {"Experiment":"1a2a3a4a5a: V^2 d discover, full path info, nextSmallestHopsBiasedPruned, failover to root","childCount":{"counts":{"0":{"min":699,"max":699,"average":699,"median":699},"1":{"min":1024,"max":1024,"average":1024,"median":1024},"2":{"min":378,"max":378,"average":378,"median":378},"3":{"min":56,"max":56,"average":56,"median":56},"4":{"min":5,"max":5,"average":5,"median":5}}},"cellStats":{"assigned":{"min":2,"max":6,"average":4.127659574468085,"median":4},"connected":{"min":1,"max":6,"average":4.085106382978723,"median":4},"ports":{"min":6,"max":6,"average":6,"median":6}},"edgeCount":{"min":6,"max":41,"average":22.288659793814432,"median":21},"linkLength":{"min":1,"max":2.2360679774997894,"average":1.3008861905845264,"median":1},"msgDelta":{"total":{"min":125,"max":1401,"average":529,"median":366},"default":{"min":0,"max":0,"average":0,"median":0},"initial":{"min":0,"max":0,"average":0,"median":0},"discover":{"min":0,"max":0,"average":0,"median":0},"discovered":{"min":0,"max":0,"average":0,"median":0},"failover":{"min":8,"max":59,"average":23.9,"median":20},"failoverStatus":{"min":8,"max":59,"average":23.9,"median":20},"rediscover":{"min":101,"max":1299,"average":455.1,"median":306},"rediscovered":{"min":8,"max":59,"average":23.9,"median":20},"undiscovered":{"min":0,"max":18,"average":2.75,"median":0}},"treeStats":{"min":1,"max":14,"average":4.307493061979648,"median":4}}

results["1a2b3a4a5a"] = {"Experiment":"1a2b3a4a5a: V^2 d discover, root port only for path, nextSmallestHopsBiasedPruned, failover to root","childCount":{"counts":{"0":{"min":699,"max":699,"average":699,"median":699},"1":{"min":1024,"max":1024,"average":1024,"median":1024},"2":{"min":378,"max":378,"average":378,"median":378},"3":{"min":56,"max":56,"average":56,"median":56},"4":{"min":5,"max":5,"average":5,"median":5}}},"cellStats":{"assigned":{"min":2,"max":6,"average":4.127659574468085,"median":4},"connected":{"min":1,"max":6,"average":4.085106382978723,"median":4},"ports":{"min":6,"max":6,"average":6,"median":6}},"edgeCount":{"min":6,"max":41,"average":22.288659793814432,"median":21},"linkLength":{"min":1,"max":2.2360679774997894,"average":1.3008861905845264,"median":1},"msgDelta":{"total":{"min":125,"max":1401,"average":529,"median":366},"default":{"min":0,"max":0,"average":0,"median":0},"initial":{"min":0,"max":0,"average":0,"median":0},"discover":{"min":0,"max":0,"average":0,"median":0},"discovered":{"min":0,"max":0,"average":0,"median":0},"failover":{"min":8,"max":59,"average":23.9,"median":20},"failoverStatus":{"min":8,"max":59,"average":23.9,"median":20},"rediscover":{"min":101,"max":1299,"average":455.1,"median":306},"rediscovered":{"min":8,"max":59,"average":23.9,"median":20},"undiscovered":{"min":0,"max":18,"average":2.2,"median":0}},"treeStats":{"min":1,"max":14,"average":4.307493061979648,"median":4}}

results["1a2c3a4a5a"] = {"Experiment":"1a2c3a4a5a: V^2 d discover, no path info - walk to root, nextSmallestHopsBiasedPruned, failover to root","childCount":{"counts":{"0":{"min":699,"max":699,"average":699,"median":699},"1":{"min":1024,"max":1024,"average":1024,"median":1024},"2":{"min":378,"max":378,"average":378,"median":378},"3":{"min":56,"max":56,"average":56,"median":56},"4":{"min":5,"max":5,"average":5,"median":5}}},"cellStats":{"assigned":{"min":2,"max":6,"average":4.127659574468085,"median":4},"connected":{"min":1,"max":6,"average":4.085106382978723,"median":4},"ports":{"min":6,"max":6,"average":6,"median":6}},"edgeCount":{"min":6,"max":41,"average":22.288659793814432,"median":21},"linkLength":{"min":1,"max":2.2360679774997894,"average":1.3008861905845264,"median":1},"msgDelta":{"total":{"min":206,"max":2093,"average":887.2,"median":656},"default":{"min":0,"max":0,"average":0,"median":0},"initial":{"min":0,"max":0,"average":0,"median":0},"discover":{"min":0,"max":0,"average":0,"median":0},"discovered":{"min":0,"max":0,"average":0,"median":0},"failover":{"min":30,"max":247,"average":99.1,"median":80},"failoverStatus":{"min":30,"max":247,"average":99.1,"median":80},"rediscover":{"min":130,"max":1378,"average":593.3,"median":441},"rediscovered":{"min":12,"max":131,"average":58.7,"median":51},"undiscovered":{"min":4,"max":90,"average":37,"median":36}},"treeStats":{"min":1,"max":14,"average":4.289130434782609,"median":4}}

results["1a2a3b4a5a"] = {"Experiment":"1a2a3b4a5a: V^2 d discover, full path info, nextSmallestHops, failover to root","childCount":{"counts":{"0":{"min":699,"max":699,"average":699,"median":699},"1":{"min":1024,"max":1024,"average":1024,"median":1024},"2":{"min":378,"max":378,"average":378,"median":378},"3":{"min":56,"max":56,"average":56,"median":56},"4":{"min":5,"max":5,"average":5,"median":5}}},"cellStats":{"assigned":{"min":2,"max":6,"average":4.127659574468085,"median":4},"connected":{"min":1,"max":6,"average":4.085106382978723,"median":4},"ports":{"min":6,"max":6,"average":6,"median":6}},"edgeCount":{"min":6,"max":41,"average":22.288659793814432,"median":21},"linkLength":{"min":1,"max":2.2360679774997894,"average":1.3008861905845264,"median":1},"msgDelta":{"total":{"min":149,"max":1799,"average":675.9,"median":600},"default":{"min":0,"max":0,"average":0,"median":0},"initial":{"min":0,"max":0,"average":0,"median":0},"discover":{"min":0,"max":0,"average":0,"median":0},"discovered":{"min":0,"max":0,"average":0,"median":0},"failover":{"min":11,"max":87,"average":44.6,"median":50},"failoverStatus":{"min":11,"max":87,"average":44.6,"median":50},"rediscover":{"min":113,"max":1495,"average":526.8,"median":426},"rediscovered":{"min":11,"max":82,"average":40.8,"median":43},"undiscovered":{"min":3,"max":48,"average":19.1,"median":26}},"treeStats":{"min":1,"max":20,"average":4.382932469935245,"median":4}}

results["1a2b3b4a5a"] = {"Experiment":"1a2b3b4a5a: V^2 d discover, root port only for path, nextSmallestHops, failover to root","childCount":{"counts":{"0":{"min":699,"max":699,"average":699,"median":699},"1":{"min":1024,"max":1024,"average":1024,"median":1024},"2":{"min":378,"max":378,"average":378,"median":378},"3":{"min":56,"max":56,"average":56,"median":56},"4":{"min":5,"max":5,"average":5,"median":5}}},"cellStats":{"assigned":{"min":2,"max":6,"average":4.127659574468085,"median":4},"connected":{"min":1,"max":6,"average":4.085106382978723,"median":4},"ports":{"min":6,"max":6,"average":6,"median":6}},"edgeCount":{"min":6,"max":41,"average":22.288659793814432,"median":21},"linkLength":{"min":1,"max":2.2360679774997894,"average":1.3008861905845264,"median":1},"msgDelta":{"total":{"min":149,"max":1799,"average":675.9,"median":600},"default":{"min":0,"max":0,"average":0,"median":0},"initial":{"min":0,"max":0,"average":0,"median":0},"discover":{"min":0,"max":0,"average":0,"median":0},"discovered":{"min":0,"max":0,"average":0,"median":0},"failover":{"min":11,"max":87,"average":44.6,"median":50},"failoverStatus":{"min":11,"max":87,"average":44.6,"median":50},"rediscover":{"min":113,"max":1495,"average":526.8,"median":426},"rediscovered":{"min":11,"max":82,"average":40.8,"median":43},"undiscovered":{"min":3,"max":48,"average":19.1,"median":26}},"treeStats":{"min":1,"max":20,"average":4.382932469935245,"median":4}}

results["1a2c3b4a5a"] = {"Experiment":"1a2c3b4a5a: V^2 d discover, no path info - walk to root, nextSmallestHops, failover to root","childCount":{"counts":{"0":{"min":699,"max":699,"average":699,"median":699},"1":{"min":1024,"max":1024,"average":1024,"median":1024},"2":{"min":378,"max":378,"average":378,"median":378},"3":{"min":56,"max":56,"average":56,"median":56},"4":{"min":5,"max":5,"average":5,"median":5}}},"cellStats":{"assigned":{"min":2,"max":6,"average":4.127659574468085,"median":4},"connected":{"min":1,"max":6,"average":4.085106382978723,"median":4},"ports":{"min":6,"max":6,"average":6,"median":6}},"edgeCount":{"min":6,"max":41,"average":22.288659793814432,"median":21},"linkLength":{"min":1,"max":2.2360679774997894,"average":1.3008861905845264,"median":1},"msgDelta":{"total":{"min":228,"max":2291,"average":1082,"median":979},"default":{"min":0,"max":0,"average":0,"median":0},"initial":{"min":0,"max":0,"average":0,"median":0},"discover":{"min":0,"max":0,"average":0,"median":0},"discovered":{"min":0,"max":0,"average":0,"median":0},"failover":{"min":34,"max":266,"average":131.1,"median":124},"failoverStatus":{"min":34,"max":266,"average":131.1,"median":124},"rediscover":{"min":138,"max":1571,"average":690.9,"median":599},"rediscovered":{"min":15,"max":139,"average":75.3,"median":82},"undiscovered":{"min":7,"max":98,"average":53.6,"median":62}},"treeStats":{"min":1,"max":20,"average":4.362164662349676,"median":4}}

results["1a2a3c4a5a"] = {"Experiment":"1a2a3c4a5a: V^2 d discover, full path info, prunedLinksFirst, failover to root","childCount":{"counts":{"0":{"min":699,"max":699,"average":699,"median":699},"1":{"min":1024,"max":1024,"average":1024,"median":1024},"2":{"min":378,"max":378,"average":378,"median":378},"3":{"min":56,"max":56,"average":56,"median":56},"4":{"min":5,"max":5,"average":5,"median":5}}},"cellStats":{"assigned":{"min":2,"max":6,"average":4.127659574468085,"median":4},"connected":{"min":1,"max":6,"average":4.085106382978723,"median":4},"ports":{"min":6,"max":6,"average":6,"median":6}},"edgeCount":{"min":6,"max":41,"average":22.288659793814432,"median":21},"linkLength":{"min":1,"max":2.2360679774997894,"average":1.3008861905845264,"median":1},"msgDelta":{"total":{"min":125,"max":1401,"average":527.7,"median":366},"default":{"min":0,"max":0,"average":0,"median":0},"initial":{"min":0,"max":0,"average":0,"median":0},"discover":{"min":0,"max":0,"average":0,"median":0},"discovered":{"min":0,"max":0,"average":0,"median":0},"failover":{"min":8,"max":57,"average":23.7,"median":20},"failoverStatus":{"min":8,"max":57,"average":23.7,"median":20},"rediscover":{"min":101,"max":1299,"average":454.6,"median":306},"rediscovered":{"min":8,"max":57,"average":23.7,"median":20},"undiscovered":{"min":0,"max":16,"average":2,"median":0}},"treeStats":{"min":1,"max":14,"average":4.308788159111933,"median":4}}

results["1a2b3c4a5a"] = {"Experiment":"1a2b3c4a5a: V^2 d discover, root port only for path, prunedLinksFirst, failover to root","childCount":{"counts":{"0":{"min":699,"max":699,"average":699,"median":699},"1":{"min":1024,"max":1024,"average":1024,"median":1024},"2":{"min":378,"max":378,"average":378,"median":378},"3":{"min":56,"max":56,"average":56,"median":56},"4":{"min":5,"max":5,"average":5,"median":5}}},"cellStats":{"assigned":{"min":2,"max":6,"average":4.127659574468085,"median":4},"connected":{"min":1,"max":6,"average":4.085106382978723,"median":4},"ports":{"min":6,"max":6,"average":6,"median":6}},"edgeCount":{"min":6,"max":41,"average":22.288659793814432,"median":21},"linkLength":{"min":1,"max":2.2360679774997894,"average":1.3008861905845264,"median":1},"msgDelta":{"total":{"min":125,"max":1401,"average":527.7,"median":366},"default":{"min":0,"max":0,"average":0,"median":0},"initial":{"min":0,"max":0,"average":0,"median":0},"discover":{"min":0,"max":0,"average":0,"median":0},"discovered":{"min":0,"max":0,"average":0,"median":0},"failover":{"min":8,"max":57,"average":23.7,"median":20},"failoverStatus":{"min":8,"max":57,"average":23.7,"median":20},"rediscover":{"min":101,"max":1299,"average":454.6,"median":306},"rediscovered":{"min":8,"max":57,"average":23.7,"median":20},"undiscovered":{"min":0,"max":16,"average":2,"median":0}},"treeStats":{"min":1,"max":14,"average":4.308788159111933,"median":4}}

results["1a2c3c4a5a"] = {"Experiment":"1a2c3c4a5a: V^2 d discover, no path info - walk to root, prunedLinksFirst, failover to root","childCount":{"counts":{"0":{"min":699,"max":699,"average":699,"median":699},"1":{"min":1024,"max":1024,"average":1024,"median":1024},"2":{"min":378,"max":378,"average":378,"median":378},"3":{"min":56,"max":56,"average":56,"median":56},"4":{"min":5,"max":5,"average":5,"median":5}}},"cellStats":{"assigned":{"min":2,"max":6,"average":4.127659574468085,"median":4},"connected":{"min":1,"max":6,"average":4.085106382978723,"median":4},"ports":{"min":6,"max":6,"average":6,"median":6}},"edgeCount":{"min":6,"max":41,"average":22.288659793814432,"median":21},"linkLength":{"min":1,"max":2.2360679774997894,"average":1.3008861905845264,"median":1},"msgDelta":{"total":{"min":4480,"max":22598,"average":12015.2,"median":11048},"default":{"min":0,"max":0,"average":0,"median":0},"initial":{"min":0,"max":0,"average":0,"median":0},"discover":{"min":0,"max":0,"average":0,"median":0},"discovered":{"min":0,"max":0,"average":0,"median":0},"failover":{"min":2240,"max":11299,"average":6007.6,"median":5524},"failoverStatus":{"min":2240,"max":11299,"average":6007.6,"median":5524},"rediscover":{"min":0,"max":0,"average":0,"median":0},"rediscovered":{"min":0,"max":0,"average":0,"median":0},"undiscovered":{"min":0,"max":0,"average":0,"median":0}},"treeStats":{"min":1,"max":13,"average":4.267439144045228,"median":4}}

function reports(metric) {
    Object.keys(results).forEach(function(r){
        console.log(r + " " + JSON.stringify(results[r][metric],null,2));
    });
}
        
