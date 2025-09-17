// background.js - service worker
// Guarda e retorna a chave API no storage do chrome, provê um endpoint simples para testar a chave.


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === 'saveApiKey') {
    chrome.storage.local.set({geminiApiKey: msg.key}, () => sendResponse({ok:true}));
    return true;
    }
    if (msg?.action === 'getApiKey') {
    chrome.storage.local.get(['geminiApiKey'], (res) => sendResponse({key: res.geminiApiKey}));
    return true;
    }
    });