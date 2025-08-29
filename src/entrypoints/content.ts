interface BackgroundResponse {
  success: boolean;
  error?: string;
  data?: any;
}

interface ImageData {
  speciesKey: string;
  imageUrl: string;
  attribution: string;
}

export default defineContentScript({
  matches: ["https://www.inaturalist.org/taxa/*"],
  main() {
    console.log("🔍 iCurador de imagens de microlearning carregado");

    // Função para inicializar
    const init = () => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initCurador);
      } else {
        initCurador();
      }
    };

    // Observar mudanças na URL
    let currentUrl = window.location.href;
    
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        console.log("🔄 URL mudou, reinicializando...");
        setTimeout(init, 500); // Aguardar um pouco para o DOM atualizar
      }
    });

    urlObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Observar mudanças no pushState/popState
    const originalPushState = history.pushState;
    const originalPopState = window.onpopstate;

    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(init, 500);
    };

    window.onpopstate = function(event) {
      if (originalPopState) originalPopState.call(this, event);
      setTimeout(init, 500);
    };

    // Inicialização inicial
    init();
  },
});

let currentSpeciesKey: string | null = null;

async function initCurador() {
  const speciesKey = extractSpeciesKey();
  if (!speciesKey) {
    console.log("❌ Não foi possível extrair species key");
    return;
  }

  // Se mudou de espécie, limpar estado anterior
  if (currentSpeciesKey !== speciesKey) {
    console.log(`🔄 Mudança de espécie detectada: ${currentSpeciesKey} -> ${speciesKey}`);
    currentSpeciesKey = speciesKey;
    
    // Fechar modal se estiver aberto
    const existingModal = document.getElementById('icurador-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // Remover aba anterior se existir
    const existingTab = document.querySelector('#icurador-tab-link');
    if (existingTab) {
      existingTab.parentElement?.remove();
    }
  }

  console.log(`✅ Species key detectado: ${speciesKey}`);

  // Verificar configuração do Redis antes de continuar
  const isConfigured = await checkRedisConfiguration();
  if (!isConfigured) {
    console.log("⚠️ Redis não configurado - funcionalidades não serão exibidas");
    return;
  }

  // Observer para detectar quando o modal abre
  observeModalChanges(speciesKey);

  // Verificar se já tem modal aberto
  setTimeout(() => {
    addSaveButtonToModal(speciesKey);
  }, 1000);

  // Adicionar aba iCurador
  setTimeout(() => {
    addICuradorTab(speciesKey);
  }, 2000);
}

async function checkRedisConfiguration(): Promise<boolean> {
  try {
    // Buscar configurações salvas
    const config = await browser.storage.sync.get(["redisUrl", "redisToken"]);

    const redisUrl = config.redisUrl as string;
    const redisToken = config.redisToken as string;

    if (!redisUrl || !redisToken) {
      console.log("🔋 Configuração do Redis incompleta");
      return false;
    }

    console.log("🔧 Redis configurado, testando conexão...");

    // Testar conexão (opcional - pode remover se quiser que seja mais rápido)
    try {
      const response = await fetch(`${redisUrl.trim()}/ping`, {
        headers: {
          Authorization: `Bearer ${redisToken.trim()}`,
        },
      });

      if (response.ok) {
        console.log("✅ Redis conectado e funcionando");
        return true;
      } else {
        console.log("❌ Redis configurado mas com erro de conexão");
        return false;
      }
    } catch (connectionError) {
      console.log("❌ Erro ao testar conexão com Redis:", connectionError);
      return false;
    }
  } catch (error) {
    console.error("❌ Erro ao verificar configuração:", error);
    return false;
  }
}

function extractSpeciesKey(): string | null {
  const match = window.location.pathname.match(/\/taxa\/(\d+)/);
  return match ? match[1] : null;
}

function extractImageUrlFromBackground(backgroundImage: string): string | null {
  const match = backgroundImage.match(/url\(["']?(.*?)["']?\)/);
  if (match && match[1]) {
    const url = match[1];
    if (url.includes("inaturalist") && !url.includes("placeholder")) {
      return url;
    }
  }
  return null;
}

function addICuradorTab(speciesKey: string) {
  const tabsContainer = document.querySelector('#main-tabs');
  if (!tabsContainer) {
    console.log("❌ Container de abas não encontrado");
    return;
  }

  // Verificar se a aba já existe
  if (document.querySelector('#icurador-tab-link')) {
    console.log("ℹ️ Aba iCurador já existe");
    return;
  }

  // Criar nova aba
  const newTabLi = document.createElement('li');
  newTabLi.setAttribute('role', 'presentation');
  newTabLi.innerHTML = `
    <a href="#" id="icurador-tab-link" role="tab" aria-expanded="false" style="cursor: pointer;">
      🔍 iCurador
    </a>
  `;

  // Adicionar event listener para abrir o modal
  const tabLink = newTabLi.querySelector('#icurador-tab-link') as HTMLAnchorElement;
  if (tabLink) {
    tabLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openICuradorModal(speciesKey);
    });
  }

  // Adicionar a nova aba
  tabsContainer.appendChild(newTabLi);

  console.log("✅ Aba iCurador adicionada com sucesso");
}

function openICuradorModal(speciesKey: string) {
  // Verificar se modal já existe e remover
  const existingModal = document.getElementById('icurador-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Criar modal
  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'icurador-modal';
  modalOverlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: rgba(0, 0, 0, 0.6) !important;
    z-index: 999999 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    backdrop-filter: blur(3px) !important;
    margin: 0 !important;
    padding: 20px !important;
    box-sizing: border-box !important;
  `;

  // Criar conteúdo do modal
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white !important;
    border-radius: 12px !important;
    width: 90% !important;
    max-width: 800px !important;
    max-height: 85vh !important;
    overflow-y: auto !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4) !important;
    position: relative !important;
    margin: 0 !important;
    z-index: 1000000 !important;
  `;

  modalContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 24px; border-bottom: 2px solid #e5e7eb; position: sticky; top: 0; background: white; border-radius: 12px 12px 0 0;">
      <div style="display: flex; justify-content: between; align-items: center;">
        <div>
          <h2 style="color: #059669; font-size: 28px; font-weight: bold; margin: 0; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 32px;">🔍</span>
            iCurador - Alternativas para Flashcards
          </h2>
          <p style="color: #6b7280; margin: 8px 0 0 0; font-size: 16px;">
            Adicione 3 alternativas incorretas para esta espécie (Táxon ID: ${speciesKey})
          </p>
        </div>
        <button 
          id="icurador-close-modal" 
          style="position: absolute; top: 16px; right: 16px; background: #f3f4f6; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #6b7280; transition: all 0.2s;"
          onmouseover="this.style.background='#e5e7eb'"
          onmouseout="this.style.background='#f3f4f6'"
          title="Fechar"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Content -->
    <div style="padding: 24px;">
      <!-- Status/Loading -->
      <div id="icurador-status" style="margin-bottom: 20px; padding: 12px; border-radius: 8px; display: none;">
      </div>

      <!-- Form -->
      <div id="icurador-form">
        <div style="display: grid; gap: 20px;">
          ${[1, 2, 3].map(num => `
            <div style="border: 2px solid #e5e7eb; border-radius: 12px; padding: 20px; background: #f9fafb;">
              <h3 style="color: #374151; font-size: 18px; font-weight: 600; margin: 0 0 15px 0;">
                Alternativa ${num}
              </h3>
              <div style="display: grid; gap: 15px;">
                <div>
                  <label style="display: block; color: #374151; font-weight: 500; margin-bottom: 5px; font-size: 14px;">
                    Nome Popular:
                  </label>
                  <input 
                    type="text" 
                    id="alt-${num}-popular" 
                    placeholder="Ex: Bem-te-vi-pequeno"
                    style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                  />
                </div>
                <div>
                  <label style="display: block; color: #374151; font-weight: 500; margin-bottom: 5px; font-size: 14px;">
                    Nome Científico:
                  </label>
                  <input 
                    type="text" 
                    id="alt-${num}-cientifico" 
                    placeholder="Ex: Pitangus lictor"
                    style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-style: italic; box-sizing: border-box;"
                  />
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Botões -->
        <div style="margin-top: 30px; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
          <button 
            id="icurador-load-btn" 
            style="padding: 12px 24px; background: #6b7280; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; transition: all 0.2s;"
            onmouseover="this.style.background='#4b5563'"
            onmouseout="this.style.background='#6b7280'"
          >
            🔄 Carregar Salvos
          </button>
          <button 
            id="icurador-save-btn" 
            style="padding: 12px 24px; background: #059669; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; transition: all 0.2s;"
            onmouseover="this.style.background='#047857'"
            onmouseout="this.style.background='#059669'"
          >
            💾 Salvar Alternativas
          </button>
        </div>
      </div>
    </div>
  `;

  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  // Adicionar event listeners
  setupICuradorModalEventListeners(speciesKey);

  // Carregar dados salvos automaticamente
  setTimeout(() => {
    loadSavedAlternatives(speciesKey);
  }, 200);

  console.log("✅ Modal iCurador aberto");
}

function setupICuradorModalEventListeners(speciesKey: string) {
  const closeBtn = document.getElementById('icurador-close-modal');
  const saveBtn = document.getElementById('icurador-save-btn');
  const loadBtn = document.getElementById('icurador-load-btn');
  const modalOverlay = document.getElementById('icurador-modal');

  // Fechar modal
  if (closeBtn && modalOverlay) {
    closeBtn.addEventListener('click', () => {
      modalOverlay.remove();
    });
  }

  // Fechar ao clicar no overlay
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.remove();
      }
    });

    // Fechar com ESC
    document.addEventListener('keydown', function escKeyHandler(e) {
      if (e.key === 'Escape') {
        modalOverlay.remove();
        document.removeEventListener('keydown', escKeyHandler);
      }
    });
  }

  // Botões de ação
  if (saveBtn) {
    saveBtn.addEventListener('click', () => saveAlternatives(speciesKey));
  }

  if (loadBtn) {
    loadBtn.addEventListener('click', () => loadSavedAlternatives(speciesKey));
  }
}

async function saveAlternatives(speciesKey: string) {
  const saveBtn = document.getElementById('icurador-save-btn') as HTMLButtonElement;
  const statusDiv = document.getElementById('icurador-status') as HTMLDivElement;
  
  if (!saveBtn || !statusDiv) return;

  // Desabilitar botão e mostrar loading
  saveBtn.disabled = true;
  saveBtn.innerHTML = '⏳ Salvando...';
  
  try {
    // Coletar dados do formulário
    const alternatives: { [key: string]: string } = {};
    
    for (let i = 1; i <= 3; i++) {
      const popularInput = document.getElementById(`alt-${i}-popular`) as HTMLInputElement;
      const cientificoInput = document.getElementById(`alt-${i}-cientifico`) as HTMLInputElement;
      
      if (popularInput?.value.trim()) {
        alternatives[`${i}:nome_popular`] = popularInput.value.trim();
      }
      if (cientificoInput?.value.trim()) {
        alternatives[`${i}:nome_cientifico`] = cientificoInput.value.trim();
      }
    }

    // Enviar para background script
    const response = await browser.runtime.sendMessage({
      action: "saveAlternatives",
      data: { speciesKey, alternatives }
    }) as BackgroundResponse;

    if (response && response.success) {
      showStatus('✅ Alternativas salvas com sucesso!', 'success');
    } else {
      throw new Error(response?.error || 'Erro desconhecido');
    }

  } catch (error) {
    console.error('❌ Erro ao salvar alternativas:', error);
    showStatus(`❌ Erro ao salvar: ${error.message}`, 'error');
  } finally {
    // Restaurar botão
    saveBtn.disabled = false;
    saveBtn.innerHTML = '💾 Salvar Alternativas';
  }
}

async function loadSavedAlternatives(speciesKey: string) {
  const loadBtn = document.getElementById('icurador-load-btn') as HTMLButtonElement;
  const statusDiv = document.getElementById('icurador-status') as HTMLDivElement;
  
  if (!loadBtn || !statusDiv) return;

  // Desabilitar botão e mostrar loading
  loadBtn.disabled = true;
  loadBtn.innerHTML = '⏳ Carregando...';
  
  try {
    const response = await browser.runtime.sendMessage({
      action: "getAlternatives",
      data: { speciesKey }
    }) as BackgroundResponse;

    if (response && response.success && response.data) {
      // Preencher formulário
      for (let i = 1; i <= 3; i++) {
        const popularInput = document.getElementById(`alt-${i}-popular`) as HTMLInputElement;
        const cientificoInput = document.getElementById(`alt-${i}-cientifico`) as HTMLInputElement;
        
        if (popularInput) {
          popularInput.value = response.data[`${i}:nome_popular`] || '';
        }
        if (cientificoInput) {
          cientificoInput.value = response.data[`${i}:nome_cientifico`] || '';
        }
      }
      
      const count = Object.keys(response.data).filter(key => key.includes(':nome_popular')).length;
      showStatus(`✅ ${count} alternativas carregadas`, 'success');
    } else {
      showStatus('ℹ️ Nenhuma alternativa salva encontrada', 'info');
      // Limpar formulário
      for (let i = 1; i <= 3; i++) {
        const popularInput = document.getElementById(`alt-${i}-popular`) as HTMLInputElement;
        const cientificoInput = document.getElementById(`alt-${i}-cientifico`) as HTMLInputElement;
        
        if (popularInput) popularInput.value = '';
        if (cientificoInput) cientificoInput.value = '';
      }
    }

  } catch (error) {
    console.error('❌ Erro ao carregar alternativas:', error);
    showStatus(`❌ Erro ao carregar: ${error.message}`, 'error');
  } finally {
    // Restaurar botão
    loadBtn.disabled = false;
    loadBtn.innerHTML = '🔄 Carregar Salvos';
  }
}

function showStatus(message: string, type: 'success' | 'error' | 'info') {
  const statusDiv = document.getElementById('icurador-status') as HTMLDivElement;
  if (!statusDiv) return;

  const colors = {
    success: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }
  };

  const color = colors[type];
  
  statusDiv.style.display = 'block';
  statusDiv.style.background = color.bg;
  statusDiv.style.border = `1px solid ${color.border}`;
  statusDiv.style.color = color.text;
  statusDiv.textContent = message;

  // Auto-hide after 4 seconds
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 4000);
}

function addSaveButtonToModal(speciesKey: string) {
  const modal = document.querySelector(".photo-modal-content");
  if (!modal) {
    console.log("🖼️ Modal não encontrado");
    return;
  }

  const photoContainer = modal.querySelector(".photo-container");
  if (!photoContainer) {
    console.log("🖼️ Container da foto não encontrado no modal");
    return;
  }

  if (photoContainer.querySelector(".curator-save-btn")) {
    console.log("🖼️ Botão já existe no modal");
    return;
  }

  const backgroundImage = getComputedStyle(photoContainer).backgroundImage;
  const imageUrl = extractImageUrlFromBackground(backgroundImage);

  if (!imageUrl) {
    console.log("🖼️ URL da imagem não encontrada");
    return;
  }

  // Extrair atribuição da foto
  const attribution = extractPhotoAttribution(modal);
  if (!attribution) {
    console.log("🖼️ Atribuição não encontrada");
    return;
  }

  // Verificar se é Creative Commons (permitir salvar apenas CC)
  if (!isCreativeCommons(attribution)) {
    console.log("🖼️ Imagem com todos os direitos reservados - não salvando");
    return;
  }

  console.log(`🖼️ Adicionando botão para: ${imageUrl.substring(0, 50)}...`);
  console.log(`📄 Atribuição: ${attribution}`);

  // Criar botão
  const saveBtn = document.createElement("button");
  saveBtn.className = "curator-save-btn";
  saveBtn.innerHTML = "💎 Imagem para o taxon (iCurator)";
  saveBtn.title = "Salvar imagem para curadoria";

  // Estilo do botão
  saveBtn.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 1001;
    background: rgba(0, 96, 69, 0.8);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    font-size: 18px;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;

  // Hover effect
  saveBtn.addEventListener("mouseenter", () => {
    saveBtn.style.background = "rgba(0, 96, 69, 0.9)";
    saveBtn.style.transform = "scale(1.1)";
  });

  saveBtn.addEventListener("mouseleave", () => {
    saveBtn.style.background = "rgba(0, 96, 69, 0.8)";
    saveBtn.style.transform = "scale(1)";
  });

  // Click handler
  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const attribution = extractPhotoAttribution(modal);
    if (attribution && isCreativeCommons(attribution)) {
      saveImage(speciesKey, imageUrl, attribution, saveBtn);
    }
  });

  if (getComputedStyle(photoContainer).position === "static") {
    (photoContainer as HTMLElement).style.position = "relative";
  }

  photoContainer.appendChild(saveBtn);
  console.log(`✅ Botão adicionado ao modal`);
}

function observeModalChanges(speciesKey: string) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (
              node.classList?.contains("photo-modal-content") ||
              node.querySelector(".photo-modal-content")
            ) {
              console.log("🔄 Modal detectado, adicionando botão...");
              setTimeout(() => addSaveButtonToModal(speciesKey), 100);
            }
          }
        });
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log("👁️ Observer configurado para detectar modal");
}

function extractPhotoAttribution(modal: Element): string | null {
  const attributionDiv = modal.querySelector(".photo-attribution span");
  if (attributionDiv && attributionDiv.textContent) {
    return attributionDiv.textContent.trim();
  }
  return null;
}

function isCreativeCommons(attribution: string): boolean {
  // Verificar se contém indicadores de Creative Commons
  const ccIndicators = [
    "CC BY",
    "CC0",
    "Creative Commons",
    "Alguns direitos reservados",
  ];

  const lowerAttribution = attribution.toLowerCase();

  // Se contém "todos os direitos reservados", não é CC
  if (lowerAttribution.includes("todos os direitos reservados")) {
    return false;
  }

  // Se contém algum indicador de CC, é Creative Commons
  return ccIndicators.some((indicator) =>
    lowerAttribution.includes(indicator.toLowerCase()),
  );
}

async function saveImage(
  speciesKey: string,
  imageUrl: string,
  attribution: string,
  button: HTMLButtonElement,
) {
  button.innerHTML = "⏳";
  button.disabled = true;

  try {
    // Enviar para background script para salvar no Redis
    const response = (await browser.runtime.sendMessage({
      action: "saveImage",
      data: { speciesKey, imageUrl, attribution },
    })) as BackgroundResponse;

    if (response?.success) {
      button.innerHTML = "✅ Imagem salva no iCurator";
      button.style.background = "rgba(0, 128, 0, 0.8)";
      console.log(`✅ Imagem salva: ${speciesKey}`);
    } else {
      throw new Error(response?.error || "Erro desconhecido");
    }

    setTimeout(() => {
      button.innerHTML = "💎 Imagem para o taxon (iCurator)";
      button.style.background = "rgba(0, 0, 0, 0.8)";
      button.disabled = false;
    }, 2000);
  } catch (error) {
    console.error("❌ Erro ao salvar imagem:", error);
    button.innerHTML = "❌";
    button.style.background = "rgba(128, 0, 0, 0.8)";

    setTimeout(() => {
      button.innerHTML = "💎 Imagem para o taxon (iCurator)";
      button.style.background = "rgba(0, 0, 0, 0.8)";
      button.disabled = false;
    }, 3000);
  }
}