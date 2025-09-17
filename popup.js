/* global pdfjsLib, Tesseract, chrome */

// ========================
// Seletores do DOM
// ========================
const pdfInput = document.getElementById('pdfInput');
const loadingEl = document.getElementById('loading');
const statusEl = document.getElementById('status');
const proceduresList = document.getElementById('proceduresList');
const personsList = document.getElementById('personsList');
const analyzeBtn = document.getElementById('analyzeBtn');
const finalReportBtn = document.getElementById('finalReportBtn');
const generateOitivasBtn = document.getElementById('generateOitivasBtn');
const oitivaType = document.getElementById('oitivaType');
const qtdPerguntas = document.getElementById('qtdPerguntas');
const outputArea = document.getElementById('outputArea');
const configApiBtn = document.getElementById('configApiBtn');
const selectedProcedureEl = document.getElementById('selectedProcedure');

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.8.162/pdf.worker.min.js';

// ========================
// Variáveis globais
// ========================
let fileText = '';
let extractedData = { procedures: [], persons: [] };
let selectedProcedure = null;
let selectedPerson = null;

// ========================
// Função para chamar a API Gemini
// ========================
async function callGeminiApi(prompt) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get('geminiApiKey', async (data) => {
      const apiKey = data.geminiApiKey;

      if (!apiKey) {
        reject("⚠️ Chave da API não configurada!");
        return;
      }

      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + apiKey,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          }
        );

        const result = await response.json();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// ========================
// Funções auxiliares
// ========================
function updateStatus(msg) {
  statusEl.textContent = msg;
}

function showLoading(show) {
  loadingEl.style.display = show ? 'block' : 'none';
}

// ========================
// Extração de texto do PDF
// ========================
async function extractTextFromPDF(file) {
  const reader = new FileReader();
  reader.readAsArrayBuffer(file);

  return new Promise((resolve, reject) => {
    reader.onload = async () => {
      try {
        const pdf = await pdfjsLib.getDocument({ data: reader.result }).promise;
        let textContent = '';

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const text = await page.getTextContent();
          const pageText = text.items.map((s) => s.str).join(' ');
          textContent += pageText + '\n';
        }

        resolve(textContent);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
  });
}

// ========================
// Handlers principais
// ========================

// Upload do PDF
pdfInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  showLoading(true);
  updateStatus("📂 Carregando PDF...");

  try {
    fileText = await extractTextFromPDF(file);

    // Simulação: preencher listas básicas (você pode melhorar depois)
    extractedData.procedures = ["Boletim de Ocorrência 123", "Inquérito Policial 456"];
    extractedData.persons = ["Vítima: João", "Testemunha: Maria", "Suspeito: Carlos"];

    proceduresList.innerHTML = extractedData.procedures.map(p => `<li>${p}</li>`).join('');
    personsList.innerHTML = extractedData.persons.map(p => `<li>${p}</li>`).join('');

    analyzeBtn.disabled = false;
    finalReportBtn.disabled = false;
    generateOitivasBtn.disabled = false;

    updateStatus("✅ PDF carregado com sucesso!");
  } catch (err) {
    console.error(err);
    updateStatus("❌ Erro ao carregar PDF!");
  } finally {
    showLoading(false);
  }
});

// Botão: Analisar Pendências
analyzeBtn.addEventListener('click', async () => {
  updateStatus("🔎 Analisando pendências...");
  try {
    const result = await callGeminiApi(
      `A partir do seguinte documento:\n${fileText}\n\nListe todas as diligências necessárias e pendentes do Inquérito Policial.`
    );
    outputArea.textContent = JSON.stringify(result, null, 2);
    updateStatus("✅ Análise concluída");
  } catch (err) {
    outputArea.textContent = "Erro: " + err;
  }
});

// Botão: Relatório Final
finalReportBtn.addEventListener('click', async () => {
  updateStatus("📝 Gerando relatório final...");
  try {
    const result = await callGeminiApi(
      `Com base no seguinte documento:\n${fileText}\n\nGere um relatório conclusivo dividido em:\n1. DOS FATOS E CIRCUNSTÂNCIAS APURADAS\n2. DOS ELEMENTOS PROBATÓRIOS\n3. DA ADEQUAÇÃO AO TIPO PENAL\n4. DA AUTORIA, DA CLASSIFICAÇÃO PENAL E DO INDICIAMENTO\n5. DA CONCLUSÃO\nO relatório final deve ter no máximo 90 linhas.`
    );
    outputArea.textContent = JSON.stringify(result, null, 2);
    updateStatus("✅ Relatório final pronto");
  } catch (err) {
    outputArea.textContent = "Erro: " + err;
  }
});

// Botão: Gerar Oitivas
generateOitivasBtn.addEventListener('click', async () => {
  const tipo = oitivaType.value;
  const qtd = parseInt(qtdPerguntas.value, 10);

  if (!qtd || qtd <= 0) {
    updateStatus("⚠️ Informe uma quantidade válida de perguntas.");
    return;
  }

  updateStatus(`🎤 Gerando ${qtd} perguntas para ${tipo}...`);

  try {
    const result = await callGeminiApi(
      `Com base no seguinte documento:\n${fileText}\n\nGere ${qtd} perguntas para uma ${tipo}, numeradas, terminando cada uma com 'R:____'.`
    );
    outputArea.textContent = JSON.stringify(result, null, 2);
    updateStatus("✅ Oitiva gerada");
  } catch (err) {
    outputArea.textContent = "Erro: " + err;
  }
});

// Botão: Configurar chave API
configApiBtn.addEventListener('click', () => {
  chrome.windows.create({
    url: 'config.html',
    type: 'popup',
    width: 400,
    height: 300
  });
});
