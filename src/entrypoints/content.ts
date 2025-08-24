interface BackgroundResponse {
  success: boolean;
  error?: string;
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

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initCurator);
    } else {
      initCurator();
    }
  },
});

async function initCurator() {
  const speciesKey = extractSpeciesKey();
  if (!speciesKey) {
    console.log("❌ Não foi possível extrair species key");
    return;
  }

  console.log(`✅ Species key detectado: ${speciesKey}`);

  // Verificar configuração do Redis antes de continuar
  const isConfigured = await checkRedisConfiguration();
  if (!isConfigured) {
    console.log("⚠️ Redis não configurado - botões não serão exibidos");
    return;
  }

  // Observer para detectar quando o modal abre
  observeModalChanges(speciesKey);

  // Verificar se já tem modal aberto
  setTimeout(() => {
    addSaveButtonToModal(speciesKey);
  }, 1000);
}

async function checkRedisConfiguration(): Promise<boolean> {
  try {
    // Buscar configurações salvas
    const config = await browser.storage.sync.get(["redisUrl", "redisToken"]);

    const redisUrl = config.redisUrl as string;
    const redisToken = config.redisToken as string;

    if (!redisUrl || !redisToken) {
      console.log("📋 Configuração do Redis incompleta");
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
  console.log(`📝 Atribuição: ${attribution}`);

  // Criar botão
  const saveBtn = document.createElement("button");
  saveBtn.className = "curator-save-btn";
  saveBtn.innerHTML = "💎";
  saveBtn.title = "Salvar imagem para curadoria";

  // Estilo do botão
  saveBtn.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 1001;
    background: rgba(0, 0, 0, 0.8);
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
    saveBtn.style.background = "rgba(0, 0, 0, 0.9)";
    saveBtn.style.transform = "scale(1.1)";
  });

  saveBtn.addEventListener("mouseleave", () => {
    saveBtn.style.background = "rgba(0, 0, 0, 0.8)";
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
      button.innerHTML = "✅";
      button.style.background = "rgba(0, 128, 0, 0.8)";
      console.log(`✅ Imagem salva: ${speciesKey}`);
    } else {
      throw new Error(response?.error || "Erro desconhecido");
    }

    setTimeout(() => {
      button.innerHTML = "💎";
      button.style.background = "rgba(0, 0, 0, 0.8)";
      button.disabled = false;
    }, 2000);
  } catch (error) {
    console.error("❌ Erro ao salvar imagem:", error);
    button.innerHTML = "❌";
    button.style.background = "rgba(128, 0, 0, 0.8)";

    setTimeout(() => {
      button.innerHTML = "💎";
      button.style.background = "rgba(0, 0, 0, 0.8)";
      button.disabled = false;
    }, 3000);
  }
}
