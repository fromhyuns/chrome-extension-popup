chrome.action.onClicked.addListener(async (tab) => {
  // Skip chrome:// and other restricted pages
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
  } catch (e) {
    // Content script not loaded yet — inject manually
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      // Wait briefly for the script to initialize
      await new Promise(r => setTimeout(r, 100));
      await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
    } catch (err) {
      console.warn('Element Inspector: cannot run on this page.', err);
    }
  }
});
