var buttonConfigs = [];

// Function to create a new button
function createButton(x, y, imageUrl, dataCharacter) {
    // Create a new button element
    var btn = document.createElement("button");

    // Set the button's properties
    btn.style.left = x + "px";
    btn.style.top = y + "px";
    btn.style.backgroundImage = "url('" + imageUrl + "')";
    btn.dataset.character = dataCharacter;
    btn.className = "custom-button";
    btn.textContent = " ";

    // Add the button to the button container
    document.getElementById("button-container").appendChild(btn);

    // Add the button's configuration to the array
    buttonConfigs.push({x: x, y: y, imageUrl: imageUrl, dataCharacter: dataCharacter});
}

function saveButtonConfigs() {
    console.log(buttonConfigs)
    // Convert the button configurations to a JSON string
    var json = JSON.stringify(buttonConfigs);

    // Create a new blob object with the JSON string
    var blob = new Blob([json], {type: "application/json"});

    // Create a link to download the blob as a file
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "buttonConfigs.json";
    link.click();
}
document.getElementById("generate").addEventListener("click",saveButtonConfigs);

// test
createButton(0, 0, "https://vip.helloimg.com/images/2023/11/22/owuIPu.png", "a");
createButton(100, 0, "https://vip.helloimg.com/images/2023/11/22/owu7gt.png", "b");
