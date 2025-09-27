// Importa a biblioteca PDF.js (certifique-se que o caminho está correto)
import * as pdfjsLib from './lib/pdf.mjs';

// Configura o caminho para o "worker" do PDF.js. ESSA LINHA É CRUCIAL.
// Ela permite que a biblioteca principal encontre e carregue o script do worker.
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');

let pdfTextContent = ''; // Armazena o texto extraído do PDF

// Listener para mensagens vindas do popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'verifyAndProcessPdf') {
        processPdfFromActiveTab().then(response => sendResponse(response)).catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Indica que a resposta será assíncrona
    }
    
    if (request.action === 'generateReport') {
        generateGeminiResponse(request.type).then(response => sendResponse(response)).catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    
    if (request.action === 'generateOitivas') {
        generateGeminiResponse('oitivas', request.options).then(response => sendResponse(response)).catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    
    if (request.action === 'testApiKey') {
        testApiKey().then(response => sendResponse(response));
        return true;
    }
});

async function processPdfFromActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || !tab.url.toLowerCase().endsWith('.pdf')) {
        return { success: false, error: 'A aba ativa não é um arquivo .pdf' };
    }
    
    try {
        pdfTextContent = await extractTextFromPdfUrl(tab.url);
        if(!pdfTextContent.trim()){
            return { success: false, error: 'Não foi possível extrair conteúdo do PDF. Pode estar vazio ou ser uma imagem.' };
        }
        
        // Agora, usamos o Gemini para extrair os dados iniciais
        const initialData = await callGeminiAPI(getInitialExtractionPrompt(pdfTextContent));
        const parsedData = JSON.parse(initialData);

        return { success: true, message: 'PDF processado. Dados extraídos!', data: parsedData };
    } catch (error) {
        console.error('Erro ao processar PDF:', error);
        return { success: false, error: `Falha ao processar o PDF: ${error.message}` };
    }
}

async function generateGeminiResponse(type, options = {}) {
    if (!pdfTextContent) {
        return { success: false, error: "Nenhum conteúdo de PDF carregado. Verifique um arquivo primeiro." };
    }

    let prompt = '';
    if (type === 'pendencias') {
        prompt = getPendenciasPrompt(pdfTextContent);
    } else if (type === 'final') {
        prompt = getRelatorioFinalPrompt(pdfTextContent);
    } else if (type === 'oitivas') {
        prompt = getOitivasPrompt(pdfTextContent, options);
    }

    try {
        const result = await callGeminiAPI(prompt);
        return { success: true, message: "Resposta gerada!", data: result };
    } catch (error) {
        return { success: false, error: `Erro na API do Gemini: ${error.message}` };
    }
}

async function extractTextFromPdfUrl(url) {
    const pdf = await pdfjsLib.getDocument(url).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        content.items.forEach(item => {
            text += item.str + ' ';
        });
        text += '\n';
    }
    return text;
}


// --- LÓGICA DA API GEMINI E PROMPTS ---

async function callGeminiAPI(prompt) {
    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (!apiKey) {
        throw new Error("Chave API do Gemini não configurada.");
    }
    
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error.message || `Erro HTTP: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
}

async function testApiKey() {
    try {
        await callGeminiAPI("Faça um teste simples respondendo apenas com 'OK'.");
        return { success: true };
    } catch(error) {
        return { success: false, error: error.message };
    }
}


// --- Funções de Geração de Prompts ---

function getInitialExtractionPrompt(text) {
    return `
    Analise o seguinte texto extraído de um documento policial e retorne as informações em um formato JSON.
    O JSON deve ter duas chaves principais: "procedimento" e "pessoas".

    1. Na chave "procedimento", extraia:
       - "numero_procedimento": O número do Inquérito (IPL), Auto de Prisão em Flagrante (APDF), ou similar. Se não houver, coloque null.
       - "numero_bo": O número do Boletim de Ocorrência (BO). Pode haver mais de um, liste-os separados por vírgula.
       - "data_fato": A data em que o evento ocorreu.
       - "local_fato": O local do evento.
       Se o documento for APENAS um BO sem IPL, o "numero_procedimento" será null.
       Se não for um documento policial, retorne um JSON com "error": "o arquivo .pdf não é um inquérito / boletim policial".

    2. Na chave "pessoas", crie arrays para cada categoria de envolvido encontrada: "Vítima(s)", "Infrator(es)/Suspeito(s)", "Testemunha(s)", "Conselheiro(s)", "Representante(s)", "Advogado(a)", "Outro(s)".
       - Para cada pessoa, crie um objeto com: "nome", "cpf", "endereco", "idade", "telefone". Se a informação não existir, use null.
       - Adicione a chave booleana "isMenor": true se a idade for menor que 18.
       - Adicione a chave booleana "isQualificacaoIncompleta": true se a pessoa tiver apenas o primeiro nome, um apelido, ou se faltar a maioria dos dados de qualificação.
    
    NÃO inclua categorias de pessoas se não houver ninguém nelas. O JSON deve ser limpo e válido.

    Texto para análise:
    ---
    ${text}
    ---
    `;
}

function getPendenciasPrompt(text) {
    return `
    Com base no texto completo do inquérito policial fornecido, atue como um analista investigativo.
    Seu objetivo é identificar todas as diligências e ordens dadas pelo Delegado de Polícia (geralmente em despachos) e avaliar o status de cumprimento de cada uma.

    Liste cada ordem e seu status como "total" (completamente cumprida), "parcial" (iniciada mas não finalizada) ou "inexistente" (nenhuma ação tomada).

    Exemplo:
    - Ordem: Intimar e ouvir Vítima e Testemunha.
      - Status Vítima: Parcial (intimada, mas não ouvida).
      - Status Testemunha: Total (intimada e ouvida).
    - Ordem: Apreender objetos e solicitar perícia.
      - Status Apreensão: Inexistente.
      - Status Perícia: Inexistente.

    Analise o texto e gere um relatório de pendências claro e objetivo.

    Texto para análise:
    ---
    ${text}
    ---
    `;
}

function getRelatorioFinalPrompt(text) {
    return `
    Atue como um Escrivão de Polícia experiente. Com base em todo o conteúdo do inquérito policial fornecido, elabore um Relatório Final de Investigação conciso e técnico.
    O relatório não deve exceder 90 linhas e deve ser estruturado nas seguintes seções obrigatórias:

    1. DOS FATOS E CIRCUNSTÂNCIAS APURADAS: Resumo objetivo do ocorrido.
    2. DOS ELEMENTOS PROBATÓRIOS: Destaque as principais provas coletadas (depoimentos, laudos, etc.).
    3. DA ADEQUAÇÃO AO TIPO PENAL: Sugira, com base nas provas, o crime que foi cometido.
    4. DA AUTORIA, DA CLASSIFICAÇÃO PENAL E DO INDICIAMENTO: Aponte o(s) provável(is) autor(es) e justifique o indiciamento.
    5. DA CONCLUSÃO: Encerramento formal, sugerindo o encaminhamento dos autos ao Judiciário.

    Seja direto e atenha-se aos fatos apresentados no texto.

    Texto para análise:
    ---
    ${text}
    ---
    `;
}

function getOitivasPrompt(text, options) {
    const { tipo, quantidade, pessoa } = options;
    return `
    Você é um assistente para um Escrivão de Polícia. Sua tarefa é gerar perguntas para uma oitiva policial, com base no contexto do documento fornecido.
    
    Informações para a geração das perguntas:
    - Procedimento: Inquérito Policial (contexto abaixo)
    - Pessoa a ser ouvida: ${pessoa}
    - Tipo de Oitiva: ${tipo}
    - Quantidade de perguntas: ${quantidade}

    As perguntas devem ser:
    1. Enumeradas e em negrito.
    2. Finalizadas com quebra de linha e parágrafo.
    3. Pertinentes ao contexto do documento, buscando elucidar os fatos.
    4. Formuladas respeitando o Código de Processo Penal Brasileiro e a Constituição Federal.
    5. Focadas em detalhes como: local, data, pessoas presentes, relação entre os envolvidos, e outros pontos chave para a investigação.

    Gere as ${quantidade} perguntas para a oitiva de ${pessoa}.

    Contexto do documento:
    ---
    ${text}
    ---
    `;
}