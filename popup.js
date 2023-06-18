console.log("popup loading");

var initialSetting;
var extensionEnabledSliderButton = document.getElementById('extension_enabled_slider_button');
var extensionReloadTabDisplayDiv = document.getElementById('extension_reload_tab_div');
var extensionReloadTabDisplayButton = document.getElementById('extension_reload_tab_button');
var extensionReloadTabDisplayButtonLabel = document.getElementById('extension_reload_tab_button_label');

async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

function toggleReloadSection() {
  extensionReloadTabDisplayButtonLabel.innerHTML = (extensionEnabledSliderButton.checked ? "Enabled" : "Disabled");
  if (initialSetting == extensionEnabledSliderButton.checked) {
    extensionReloadTabDisplayDiv.style.display = "none";
  } else {
    extensionReloadTabDisplayDiv.style.display = "block";
  }
}

getCurrentTab().then((tab) => {
  let tabId = tab.id;
  
  extensionReloadTabDisplayButton.addEventListener("click", function() {
    chrome.tabs.reload(tabId);
    window.close();
  });
  
  chrome.storage.sync.get(["PSVBExtensionDisabled_" + tabId], function(result) {
    
    extensionEnabledSliderButton.checked = (result["PSVBExtensionDisabled_" + tabId] === true ? false : true);
    
    initialSetting = extensionEnabledSliderButton.checked;
    
    extensionEnabledSliderButton.addEventListener("click", function() {
      if (extensionEnabledSliderButton.checked) {
        // Enabling script again
        console.log("Enabling");
        
        chrome.storage.sync.remove("PSVBExtensionDisabled_" + tabId, function() {
          // success
          toggleReloadSection()
        });
        chrome.action.setIcon({path: "PSVB_icon.png", tabId: tabId});
      } else {
        // Disabling script
        console.log("Disabling");
        
        let storageObj = {};
        storageObj["PSVBExtensionDisabled_" + tabId] = true;
        
        chrome.storage.sync.set(storageObj, function() {
          // success
          toggleReloadSection()
        });
        chrome.action.setIcon({path: "PSVB_icon_grey.png", tabId: tabId});
      }
    });
  });
});

console.log("popup loaded");