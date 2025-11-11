chrome.runtime.onInstalled.addListener(() => {
  console.log("[gongmiri] installed");
});

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("extension/viewer.html");
  await chrome.tabs.create({ url });
});
