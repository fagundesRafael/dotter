document.getElementById('saveApiKeyBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
  
    if (!apiKey) {
      document.getElementById('status').textContent = "⚠️ Informe a chave antes de salvar!";
      return;
    }
  
    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
      document.getElementById('status').textContent = "✅ Chave salva com sucesso!";
    });
  });
  