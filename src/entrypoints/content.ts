interface BackgroundResponse {
  success: boolean;
  error?: string;
}

interface ImageData {
  speciesKey: string;
  imageUrl: string;
  attribution: string;
}

interface TaxonomicLevel {
  name: string;
  displayName: string;
  order: number;
}

const TAXONOMIC_LEVELS: TaxonomicLevel[] = [
  { name: "kingdom", displayName: "Reino", order: 1 },
  { name: "phylum", displayName: "Filo", order: 2 },
  { name: "class", displayName: "Classe", order: 3 },
  { name: "order", displayName: "Ordem", order: 4 },
  { name: "family", displayName: "Família", order: 5 },
  { name: "genus", displayName: "Gênero", order: 6 },
  { name: "subgenus", displayName: "Subgênero", order: 7 },
  { name: "species", displayName: "Espécie", order: 8 },
];

export default defineContentScript({
  matches: ["https://www.inaturalist.org/taxa/*"],
  main() {
    console.log("🔍 iCurador de imagens de microlearning carregado");

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initCurador);
    } else {
      initCurador();
    }
  },
});

async function initCurador() {
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

  // Adicionar dropdown de nível taxonômico
  setTimeout(() => {
    addTaxonomicLevelDropdown(speciesKey);
  }, 1500);
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

function extractTaxonomicHierarchy(): TaxonomicLevel[] {
  const availableLevels: TaxonomicLevel[] = [];

  // Tentar extrair da breadcrumb de taxonomia
  const breadcrumbLinks = document.querySelectorAll(
    '.breadcrumbs a[href*="/taxa/"]',
  );
  if (breadcrumbLinks.length > 0) {
    // Mapear os links encontrados para níveis taxonômicos
    breadcrumbLinks.forEach((link, index) => {
      if (index < TAXONOMIC_LEVELS.length) {
        availableLevels.push(TAXONOMIC_LEVELS[index]);
      }
    });
  }

  // Se não encontrou breadcrumbs, tentar extrair da seção de classificação
  const classificationSection = document.querySelector(
    ".classification, .taxonomy",
  );
  if (classificationSection && availableLevels.length === 0) {
    const taxonomyItems =
      classificationSection.querySelectorAll('a[href*="/taxa/"]');
    taxonomyItems.forEach((item, index) => {
      if (index < TAXONOMIC_LEVELS.length) {
        availableLevels.push(TAXONOMIC_LEVELS[index]);
      }
    });
  }

  // Fallback: assumir que pelo menos reino, filo, classe, ordem, família, gênero e espécie estão disponíveis
  if (availableLevels.length === 0) {
    return TAXONOMIC_LEVELS.slice(0, 6); // Reino até Gênero por padrão
  }

  return availableLevels;
}

async function addTaxonomicLevelDropdown(speciesKey: string) {
  // Verificar se já existe o dropdown
  if (document.querySelector(".curator-taxonomic-dropdown")) {
    return;
  }

  // Encontrar onde inserir o dropdown (próximo ao nome do táxon)
  const taxonNameContainer = document.querySelector(".taxon-name, .title, h1");
  if (!taxonNameContainer) {
    console.log("❌ Container do nome do táxon não encontrado");
    return;
  }

  const availableLevels = extractTaxonomicHierarchy();

  // Buscar nível salvo anteriormente
  let savedLevel: string | null = null;
  try {
    const response = (await browser.runtime.sendMessage({
      action: "getTaxonomicLevel",
      data: { speciesKey },
    })) as BackgroundResponse;

    if (response?.success && response.data) {
      savedLevel = response.data;
    }
  } catch (error) {
    console.log("Erro ao buscar nível taxonômico salvo:", error);
  }

  // Criar container do dropdown
  const dropdownContainer = document.createElement("div");
  dropdownContainer.className = "curator-taxonomic-dropdown";
  dropdownContainer.style.cssText = `
    margin-top: 12px;
    padding: 12px;
    background: oklch(90.5% 0.093 164.15);
    border: 1px solid oklch(43.2% 0.095 166.913);
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Criar label
  const label = document.createElement("label");
  label.innerHTML = "🔍 <strong>Nível máximo iCurador:</strong>";
  label.style.cssText = `
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    color: #495057;
    font-weight: 600;
  `;

  // Criar select
  const select = document.createElement("select");
  select.className = "curator-level-select";
  select.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ced4da;
    border-radius: 6px;
    background: white;
    font-size: 14px;
    color: #495057;
    cursor: pointer;
  `;

  // Adicionar opção vazia
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Selecione o nível máximo...";
  defaultOption.disabled = true;
  defaultOption.selected = !savedLevel;
  select.appendChild(defaultOption);

  // Adicionar opções dos níveis disponíveis
  availableLevels.forEach((level) => {
    const option = document.createElement("option");
    option.value = level.name;
    option.textContent = level.displayName;
    if (savedLevel === level.name) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  // Adicionar evento de mudança
  select.addEventListener("change", async (e) => {
    const selectedLevel = (e.target as HTMLSelectElement).value;
    if (selectedLevel) {
      await saveTaxonomicLevel(speciesKey, selectedLevel, select);
    }
  });

  // Montar o dropdown
  dropdownContainer.appendChild(label);
  dropdownContainer.appendChild(select);

  // Inserir depois do container do nome
  taxonNameContainer.parentElement?.insertBefore(
    dropdownContainer,
    taxonNameContainer.nextSibling,
  );

  console.log(`✅ Dropdown de nível taxonômico adicionado para ${speciesKey}`);
}

async function saveTaxonomicLevel(
  speciesKey: string,
  level: string,
  select: HTMLSelectElement,
) {
  const originalBg = select.style.background;
  select.style.background = "#fff3cd";
  select.disabled = true;

  try {
    const response = (await browser.runtime.sendMessage({
      action: "saveTaxonomicLevel",
      data: { speciesKey, level },
    })) as BackgroundResponse;

    if (response?.success) {
      select.style.background = "#d4edda";
      console.log(`✅ Nível taxonômico salvo: ${speciesKey} -> ${level}`);

      setTimeout(() => {
        select.style.background = originalBg;
        select.disabled = false;
      }, 1500);
    } else {
      throw new Error(response?.error || "Erro desconhecido");
    }
  } catch (error) {
    console.error("❌ Erro ao salvar nível taxonômico:", error);
    select.style.background = "#f8d7da";

    setTimeout(() => {
      select.style.background = originalBg;
      select.disabled = false;
    }, 2000);
  }
}
