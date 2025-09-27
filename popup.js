document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos da UI
    const verifyPdfBtn = document.getElementById('verify-pdf-btn');
    const statusBar = document.getElementById('status-bar');
    const loadingBarContainer = document.getElementById('loading-bar-container');
    const loadingBar = document.querySelector('.loading-bar');
    const mainContent = document.getElementById('main-content');
    
    const relatorioPendenciasBtn = document.getElementById('relatorio-pendencias-btn');
    const relatorioFinalBtn = document.getElementById('relatorio-final-btn');
    const gerarOitivasBtn = document.getElementById('gerar-oitivas-btn');
    
    const toggleApiBtn = document.getElementById('toggle-api-config-btn');
    const apiConfigContent = document.getElementById('api-config-content');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyBtn = document.getElementById('save-api-key-btn');
    
    const outputArea = document.getElementById('output-area');

    // Estado inicial dos botões
    disableMainButtons();

    // Event Listeners
    verifyPdfBtn.addEventListener('click', () => {
        setLoadingState(true, 'Verificando aba...');
        chrome.runtime.sendMessage({ action: 'verifyAndProcessPdf' }, (response) => {
            handleResponse(response);
        });
    });

    relatorioPendenciasBtn.addEventListener('click', () => {
        setLoadingState(true, 'Gerando Relatório de Pendências...');
        outputArea.innerHTML = '';
        chrome.runtime.sendMessage({ action: 'generateReport', type: 'pendencias' }, (response) => {
            handleResponse(response, true);
        });
    });

    relatorioFinalBtn.addEventListener('click', () => {
        setLoadingState(true, 'Gerando Relatório Final...');
        outputArea.innerHTML = '';
        chrome.runtime.sendMessage({ action: 'generateReport', type: 'final' }, (response) => {
            handleResponse(response, true);
        });
    });

    gerarOitivasBtn.addEventListener('click', () => {
        const tipoOitiva = document.getElementById('oitiva-tipo').value;
        const qtdPerguntas = document.getElementById('oitiva-qtd').value;
        const selectedPerson = document.querySelector('input[name="pessoa-selecionada"]:checked');

        if (!qtdPerguntas || qtdPerguntas < 1) {
            updateStatus('Por favor, insira uma quantidade de perguntas válida.', 'error');
            return;
        }
        if (!selectedPerson) {
            updateStatus('Por favor, selecione uma pessoa da lista para gerar as perguntas.', 'error');
            return;
        }

        setLoadingState(true, 'Gerando Oitivas...');
        outputArea.innerHTML = '';
        chrome.runtime.sendMessage({ 
            action: 'generateOitivas',
            options: {
                tipo: tipoOitiva,
                quantidade: qtdPerguntas,
                pessoa: selectedPerson.value
            }
        }, (response) => {
            handleResponse(response, true);
        });
    });

    toggleApiBtn.addEventListener('click', () => {
        const isVisible = apiConfigContent.style.display === 'block';
        apiConfigContent.style.display = isVisible ? 'none' : 'block';
    });

    saveApiKeyBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.local.set({ apiKey: apiKey }, () => {
                updateStatus('Chave API salva. Testando...', 'info');
                // Envia mensagem para testar a chave
                chrome.runtime.sendMessage({ action: 'testApiKey' }, (response) => {
                    if (response.success) {
                        updateStatus('Chave API configurada e funcionando!', 'success');
                    } else {
                        updateStatus(`Erro: ${response.error}`, 'error');
                    }
                });
            });
        }
    });

    // Funções de ajuda
    function setLoadingState(isLoading, message) {
        if (isLoading) {
            updateStatus(message, 'loading');
            loadingBarContainer.style.display = 'block';
            loadingBar.style.width = '50%'; // Animação
            verifyPdfBtn.disabled = true;
            disableMainButtons();
        } else {
            loadingBar.style.width = '100%';
            setTimeout(() => {
                loadingBarContainer.style.display = 'none';
                loadingBar.style.width = '0%';
                verifyPdfBtn.disabled = false;
            }, 500);
        }
    }

    function handleResponse(response, isOutput = false) {
        setLoadingState(false);
        if (response.success) {
            updateStatus(response.message, 'success');
            if(isOutput){
                outputArea.innerText = response.data;
            } else {
                 mainContent.style.display = 'block';
                enableMainButtons();
                renderProcedimento(response.data.procedimento);
                renderPessoas(response.data.pessoas);
            }
        } else {
            updateStatus(response.error, 'error');
            mainContent.style.display = 'none';
        }
    }

    function updateStatus(message, type) {
        statusBar.textContent = message;
        statusBar.className = `status-${type}`;
    }

    function disableMainButtons() {
        relatorioPendenciasBtn.disabled = true;
        relatorioFinalBtn.disabled = true;
        gerarOitivasBtn.disabled = true;
    }

    function enableMainButtons() {
        relatorioPendenciasBtn.disabled = false;
        relatorioFinalBtn.disabled = false;
        gerarOitivasBtn.disabled = false;
    }

    function renderProcedimento(proc) {
        const container = document.getElementById('procedimento-details');
        container.innerHTML = `
            <p><strong>Procedimento:</strong> ${proc.numero_procedimento || 'Não identificado'}</p>
            <p><strong>Boletim de Ocorrência:</strong> ${proc.numero_bo || 'Não identificado'}</p>
            <p><strong>Data do Fato:</strong> ${proc.data_fato || 'Não identificado'}</p>
            <p><strong>Local do Fato:</strong> ${proc.local_fato || 'Não identificado'}</p>
        `;
    }

    function renderPessoas(pessoas) {
        const container = document.getElementById('pessoas-list');
        container.innerHTML = '';
        Object.keys(pessoas).forEach(grupo => {
            if (pessoas[grupo].length > 0) {
                const groupTitle = document.createElement('h4');
                groupTitle.textContent = grupo.charAt(0).toUpperCase() + grupo.slice(1);
                container.appendChild(groupTitle);
                
                pessoas[grupo].forEach(pessoa => {
                    let className = 'pessoa';
                    if (pessoa.isMenor) className += ' menor-idade';
                    if (pessoa.isQualificacaoIncompleta) className += ' sem-qualificacao';

                    const pessoaDiv = document.createElement('div');
                    pessoaDiv.className = className;
                    
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = 'pessoa-selecionada';
                    radio.value = `${grupo}: ${pessoa.nome}`;
                    radio.id = `pessoa-${pessoa.nome.replace(/\s/g, '')}`;

                    const label = document.createElement('label');
                    label.htmlFor = radio.id;
                    label.textContent = ` ${pessoa.nome} (Idade: ${pessoa.idade || 'N/A'}) - CPF: ${pessoa.cpf || 'N/A'}`;
                    
                    pessoaDiv.appendChild(radio);
                    pessoaDiv.appendChild(label);
                    container.appendChild(pessoaDiv);
                });
            }
        });
    }
    
    // Verifica a chave da API ao abrir o popup
    chrome.storage.local.get('apiKey', ({ apiKey }) => {
        if (!apiKey) {
            updateStatus('Configure sua chave API do Gemini.', 'info');
        } else {
             apiKeyInput.value = apiKey;
        }
    });
});