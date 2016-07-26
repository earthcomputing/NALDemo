'use strict';
let showTree = "";
window.onload = function() {
    const configForm = document.getElementById("configForm");
    const buildButton = document.getElementById("buildButton");
    const radioButtons = []
    for ( const c in configurations ) {
        const e = document.createElement("input");
        radioButtons.push(e);
        e.type = "radio";
        e.name = "config";
        e.value = c;
        e.onclick = function() { setConfig(this.value); };
        configForm.appendChild(e);
        if ( c === "grid" ) {
            const n = document.createElement("input");
            configForm.appendChild(n);
            n.min = 6;
            n.max = 100;
            n.style = "width:40px";
            n.type = "number";
            n.id = "gridSize";
            n.value = 6;
            n.onclick = function() {
                setConfig(e.value);
                e.checked = false;
                buildButton.disabled = false;
            }
        }
        configForm.appendChild(document.createTextNode(configurations[c].name));
        configForm.appendChild(document.createElement("br"));
    }
};
function build() {
    d3.selectAll(".link").remove();
    d3.selectAll(".node").remove();
    dataCenter = new DataCenterFactory(blueprint);
    dataCenter.showConfiguration({"tree":false,"root":false});
}
function resetView() {
    showTree = "";
    dataCenter.showTree();
}
