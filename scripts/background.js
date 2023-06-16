chrome.runtime.onInstalled.addListener(() => {
  /*
  chrome.action.setBadgeText({
    text: "ON",
  });
  */
  
  var ignoreList = [
    "https://fi.somethingawful.com/images/pyf-quote6.gif",
    "https://fi.somethingawful.com/images/pyf-post.gif",
    "https://fi.somethingawful.com/style/posticon-new.gif",
    "https://fi.somethingawful.com/images/pyf-reply.gif",
    "https://fi.somethingawful.com/images/pyf-report.gif",
    "https://fi.somethingawful.com/style/posticon-seen.gif",
    "https://fi.somethingawful.com/images/pyf-edit2.gif",
    "https://fi.somethingawful.com/images/buttons/sa-edit.gif",
    "https://fi.somethingawful.com/images/forum-post.gif",
    "https://fi.somethingawful.com/images/forum-reply.gif",
    "https://fi.somethingawful.com/images/sa-quote.gif",
    "https://fi.somethingawful.com/images/button-report.gif",
  ];
  
  chrome.storage.sync.get(["ignoreList"]).then((result) => {
    if (Object.keys(result).length === 0) {
      chrome.storage.sync.set({ ignoreList: ignoreList }).then(() => {
        console.log("Set initial ignorelist.");
      });
    } else {
      console.log("Ignore list already initialized.");
    }
  });
  
  chrome.scripting
    .registerContentScripts([{
      id: "psvb_script",
      css: [
        "css/commons.css",
        "css/remove_marquee.css",
        "css/gif_player.css",
        "css/png_player.css",
        "css/webp_player.css"
      ],
      js: [
        "lib/libgif.js", // SuperGif global object
        "lib/libpng.js", // APNG functionality
        "lib/libwebp.js", // WEBP functionality
        "scripts/PSVB_core.js"
      ],
      allFrames: true,
      persistAcrossSessions: true,
      matches: ["http://*/*","https://*/*","file://*/*"],
      runAt: "document_start",
    }])
    .then(() => {
      console.log("registration complete");
      /*
      chrome.scripting
        .getRegisteredContentScripts()
        .then(scripts => console.log("registered content scripts", scripts));
      */
    })
    .catch((err) => console.warn("unexpected error", err));
});

chrome.runtime.onMessage.addListener(
  function(message, sender, onSuccess) {
    if (!message.type) {
      console.log("No type given. Aborting!", message);
      return;
    }
    switch(message.type) {
      case 'PSVBImageFetch':
        fetch(message.url)
          .then(response => response.arrayBuffer())
          .then(buffer => onSuccess(new Uint8Array(buffer)))
        return true;  // Will respond asynchronously.
        break;
      case 'PSVBTabIDFetch':
        onSuccess(sender.tab.id);
        break;
      default:
        console.log("Unhandled type:", message.type);
        console.log("Message were:", message);
    }
  }
);