interface SaveImageMessage {
  action: "saveImage";
  data: {
    speciesKey: string;
    imageUrl: string;
    attribution: string;
  };
}

interface GetImageMessage {
  action: "getImage";
  data: {
    speciesKey: string;
  };
}

interface SaveTaxonomicLevelMessage {
  action: "saveTaxonomicLevel";
  data: {
    speciesKey: string;
    level: string;
  };
}

interface GetTaxonomicLevelMessage {
  action: "getTaxonomicLevel";
  data: {
    speciesKey: string;
  };
}

interface BackgroundResponse {
  success: boolean;
  error?: string;
  data?: any;
}

export default defineBackground(() => {
  console.log("Background script iniciado", { id: browser.runtime.id });

  // Criar menus de contexto
  createContextMenus();

  // Escutar mensagens do content script
  browser.runtime.onMessage.addListener((message: any, sender: any) => {
    if (message.action === "saveImage") {
      return saveImageToRedis(message as SaveImageMessage);
    } else if (message.action === "getImage") {
      return getImageFromRedis(message as GetImageMessage);
    } else if (message.action === "saveTaxonomicLevel") {
      return saveTaxonomicLevelToRedis(message as SaveTaxonomicLevelMessage);
    } else if (message.action === "getTaxonomicLevel") {
      return getTaxonomicLevelFromRedis(message as GetTaxonomicLevelMessage);
    }
    return Promise.resolve({ success: false, error: "Ação não reconhecida" });
  });

  // Escutar cliques no menu de contexto
  browser.contextMenus.onClicked.addListener(handleContextMenuClick);

  // Escutar mudanças de aba para atualizar menus
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await browser.tabs.get(activeInfo.tabId);
    if (tab.url?.includes("inaturalist.org/taxa/")) {
      const taxonMatch = tab.url.match(/\/taxa\/(\d+)/);
      if (taxonMatch) {
        await updateContextMenusWithCurrentLevel(taxonMatch[1]);
      }
    }
  });

  // Escutar mudanças de URL para atualizar menus
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.url?.includes("inaturalist.org/taxa/")) {
      const taxonMatch = tab.url.match(/\/taxa\/(\d+)/);
      if (taxonMatch) {
        await updateContextMenusWithCurrentLevel(taxonMatch[1]);
      }
    }
  });
});

async function createContextMenus() {
  try {
    // Remover menus existentes
    await browser.contextMenus.removeAll();

    // Menu principal - apenas para páginas de táxon
    browser.contextMenus.create({
      id: "icurator-main",
      title: "iCurator",
      contexts: ["all"],
      documentUrlPatterns: ["https://www.inaturalist.org/taxa/*"],
    });

    // Níveis taxonômicos disponíveis
    const taxonomicLevels = [
      { name: "kingdom", displayName: "Reino" },
      { name: "phylum", displayName: "Filo" },
      { name: "class", displayName: "Classe" },
      { name: "order", displayName: "Ordem" },
      { name: "family", displayName: "Família" },
      { name: "genus", displayName: "Gênero" },
      { name: "subgenus", displayName: "Subgênero" },
      { name: "species", displayName: "Espécie" },
    ];

    // Criar submenu para cada nível taxonômico
    taxonomicLevels.forEach((level) => {
      browser.contextMenus.create({
        id: `icurator-level-${level.name}`,
        title: `🎯 ${level.displayName}`,
        parentId: "icurator-main",
        contexts: ["all"],
        documentUrlPatterns: ["https://www.inaturalist.org/taxa/*"],
      });
    });

    console.log("✅ Menus de contexto criados com sucesso");
  } catch (error) {
    console.error("❌ Erro ao criar menus de contexto:", error);
  }
}

async function handleContextMenuClick(info: any, tab: any) {
  try {
    // Verificar se é um clique em nível taxonômico
    if (info.menuItemId.startsWith("icurator-level-")) {
      const levelName = info.menuItemId.replace("icurator-level-", "");
      await handleTaxonomicLevelSelection(levelName, tab);
    } else {
      console.log("Menu item não reconhecido:", info.menuItemId);
    }
  } catch (error) {
    console.error("❌ Erro ao processar clique no menu de contexto:", error);
  }
}

async function handleTaxonomicLevelSelection(levelName: string, tab: any) {
  if (!tab?.url) return;

  const taxonMatch = tab.url.match(
    /https:\/\/www\.inaturalist\.org\/taxa\/(\d+)/,
  );
  if (!taxonMatch) return;

  const speciesKey = taxonMatch[1];

  try {
    // Salvar o nível taxonômico selecionado
    const response = await saveTaxonomicLevelToRedis({
      action: "saveTaxonomicLevel",
      data: { speciesKey, level: levelName },
    });

    const levels: { [key: string]: string } = {
      kingdom: "Reino",
      phylum: "Filo",
      class: "Classe",
      order: "Ordem",
      family: "Família",
      genus: "Gênero",
      subgenus: "Subgênero",
      species: "Espécie",
    };

    if (response.success) {
      // Recriar menus para destacar o novo nível selecionado
      await updateContextMenusWithCurrentLevel(speciesKey);

      // Mostrar notificação de sucesso
      await browser.notifications.create({
        type: "basic",
        iconUrl: "icon/48.png",
        title: "iCurador - Nível Salvo",
        message: `🎯 Nível máximo definido como: ${levels[levelName]}\nTáxon ID: ${speciesKey}`,
      });
    } else {
      throw new Error(response.error || "Erro desconhecido");
    }
  } catch (error) {
    console.error("❌ Erro ao salvar nível taxonômico:", error);
    await browser.notifications.create({
      type: "basic",
      iconUrl: "icon/48.png",
      title: "iCurador - Erro",
      message: "❌ Erro ao salvar nível taxonômico",
    });
  }
}

async function updateContextMenusWithCurrentLevel(speciesKey: string) {
  try {
    // Buscar o nível atual
    const levelResponse = await getTaxonomicLevelFromRedis({
      action: "getTaxonomicLevel",
      data: { speciesKey },
    });

    const currentLevel = levelResponse.success ? levelResponse.data : null;

    // Remover menus existentes
    await browser.contextMenus.removeAll();

    // Menu principal
    browser.contextMenus.create({
      id: "icurator-main",
      title: "🔍 iCurador",
      contexts: ["all"],
      documentUrlPatterns: ["https://www.inaturalist.org/taxa/*"],
    });

    // Níveis taxonômicos disponíveis
    const taxonomicLevels = [
      { name: "kingdom", displayName: "Reino" },
      { name: "phylum", displayName: "Filo" },
      { name: "class", displayName: "Classe" },
      { name: "order", displayName: "Ordem" },
      { name: "family", displayName: "Família" },
      { name: "genus", displayName: "Gênero" },
      { name: "subgenus", displayName: "Subgênero" },
      { name: "species", displayName: "Espécie" },
    ];

    // Criar submenu para cada nível taxonômico, destacando o atual
    taxonomicLevels.forEach((level) => {
      const isSelected = currentLevel === level.name;
      const title = isSelected
        ? `✅ ${level.displayName} (atual)`
        : `🎯 ${level.displayName}`;

      browser.contextMenus.create({
        id: `icurator-level-${level.name}`,
        title: title,
        parentId: "icurator-main",
        contexts: ["all"],
        documentUrlPatterns: ["https://www.inaturalist.org/taxa/*"],
        enabled: !isSelected, // Desabilitar o item atual
      });
    });
  } catch (error) {
    console.error("❌ Erro ao atualizar menus de contexto:", error);
  }
}

async function saveImageToRedis(
  message: SaveImageMessage,
): Promise<BackgroundResponse> {
  const { speciesKey, imageUrl, attribution } = message.data;

  try {
    // Buscar configurações do Redis
    const config = await browser.storage.sync.get(["redisUrl", "redisToken"]);
    const redisUrl = config.redisUrl as string;
    const redisToken = config.redisToken as string;

    if (!redisUrl || !redisToken) {
      throw new Error("Configuração do Redis não encontrada");
    }

    // Criar chaves para URL e atribuição
    const imageKey = `species:imagem:${speciesKey}`;
    const attributionKey = `species:atribuicaoImg:${speciesKey}`;

    console.log(
      `Salvando no Redis - URL: ${imageKey}, Atribuição: ${attributionKey}`,
    );

    // Salvar URL da imagem
    const imageResponse = await fetch(
      `${redisUrl.trim()}/set/${encodeURIComponent(imageKey)}/${encodeURIComponent(imageUrl)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${redisToken.trim()}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      throw new Error(
        `Erro HTTP ao salvar imagem ${imageResponse.status}: ${errorText}`,
      );
    }

    const imageResult = await imageResponse.json();
    if (imageResult.error) {
      throw new Error(`Erro do Redis ao salvar imagem: ${imageResult.error}`);
    }

    // Salvar atribuição
    const attributionResponse = await fetch(
      `${redisUrl.trim()}/set/${encodeURIComponent(attributionKey)}/${encodeURIComponent(attribution)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${redisToken.trim()}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!attributionResponse.ok) {
      const errorText = await attributionResponse.text();
      throw new Error(
        `Erro HTTP ao salvar atribuição ${attributionResponse.status}: ${errorText}`,
      );
    }

    const attributionResult = await attributionResponse.json();
    if (attributionResult.error) {
      throw new Error(
        `Erro do Redis ao salvar atribuição: ${attributionResult.error}`,
      );
    }

    if (imageResult.result === "OK" && attributionResult.result === "OK") {
      console.log(`✅ Imagem e atribuição salvas com sucesso no Redis`);
      return { success: true };
    } else {
      throw new Error(
        `Resposta inesperada do Redis: imagem=${JSON.stringify(imageResult)}, atribuição=${JSON.stringify(attributionResult)}`,
      );
    }
  } catch (error) {
    console.error("❌ Erro ao salvar no Redis:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao salvar no Redis",
    };
  }
}

async function saveTaxonomicLevelToRedis(
  message: SaveTaxonomicLevelMessage,
): Promise<BackgroundResponse> {
  const { speciesKey, level } = message.data;

  try {
    // Buscar configurações do Redis
    const config = await browser.storage.sync.get(["redisUrl", "redisToken"]);
    const redisUrl = config.redisUrl as string;
    const redisToken = config.redisToken as string;

    if (!redisUrl || !redisToken) {
      throw new Error("Configuração do Redis não encontrada");
    }

    // Criar chave para o nível taxonômico
    const levelKey = `species:taxonomiclevel:${speciesKey}`;

    console.log(
      `Salvando nível taxonômico no Redis - Chave: ${levelKey}, Valor: ${level}`,
    );

    // Salvar nível taxonômico
    const response = await fetch(
      `${redisUrl.trim()}/set/${encodeURIComponent(levelKey)}/${encodeURIComponent(level)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${redisToken.trim()}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Erro HTTP ao salvar nível taxonômico ${response.status}: ${errorText}`,
      );
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(
        `Erro do Redis ao salvar nível taxonômico: ${result.error}`,
      );
    }

    if (result.result === "OK") {
      console.log(`✅ Nível taxonômico salvo com sucesso no Redis`);
      return { success: true };
    } else {
      throw new Error(
        `Resposta inesperada do Redis: ${JSON.stringify(result)}`,
      );
    }
  } catch (error) {
    console.error("❌ Erro ao salvar nível taxonômico no Redis:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao salvar nível taxonômico no Redis",
    };
  }
}

async function getTaxonomicLevelFromRedis(
  message: GetTaxonomicLevelMessage,
): Promise<BackgroundResponse> {
  const { speciesKey } = message.data;

  try {
    // Buscar configurações do Redis
    const config = await browser.storage.sync.get(["redisUrl", "redisToken"]);
    const redisUrl = config.redisUrl as string;
    const redisToken = config.redisToken as string;

    if (!redisUrl || !redisToken) {
      throw new Error("Configuração do Redis não encontrada");
    }

    // Criar chave para buscar o nível taxonômico
    const levelKey = `species:taxonomiclevel:${speciesKey}`;

    console.log(`Buscando nível taxonômico no Redis - Chave: ${levelKey}`);

    // Buscar nível taxonômico
    const response = await fetch(
      `${redisUrl.trim()}/get/${encodeURIComponent(levelKey)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${redisToken.trim()}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Erro HTTP ao buscar nível taxonômico ${response.status}: ${errorText}`,
      );
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(
        `Erro do Redis ao buscar nível taxonômico: ${result.error}`,
      );
    }

    if (result.result === null) {
      console.log(
        `❌ Nenhum nível taxonômico encontrado para a chave: ${levelKey}`,
      );
      return { success: true, data: null };
    }

    console.log(
      `✅ Nível taxonômico encontrado no Redis - Chave: ${levelKey}, Valor: ${result.result}`,
    );
    return {
      success: true,
      data: result.result,
    };
  } catch (error) {
    console.error("❌ Erro ao buscar nível taxonômico no Redis:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao buscar nível taxonômico no Redis",
    };
  }
}

async function getImageFromRedis(
  message: GetImageMessage,
): Promise<BackgroundResponse> {
  const { speciesKey } = message.data;

  try {
    // Buscar configurações do Redis
    const config = await browser.storage.sync.get(["redisUrl", "redisToken"]);
    const redisUrl = config.redisUrl as string;
    const redisToken = config.redisToken as string;

    if (!redisUrl || !redisToken) {
      throw new Error("Configuração do Redis não encontrada");
    }

    // Criar chaves para buscar URL e atribuição
    const imageKey = `species:imagem:${speciesKey}`;
    const attributionKey = `species:atribuicaoImg:${speciesKey}`;

    console.log(
      `Buscando no Redis - URL: ${imageKey}, Atribuição: ${attributionKey}`,
    );

    // Buscar URL da imagem
    const imageResponse = await fetch(
      `${redisUrl.trim()}/get/${encodeURIComponent(imageKey)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${redisToken.trim()}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      throw new Error(
        `Erro HTTP ao buscar imagem ${imageResponse.status}: ${errorText}`,
      );
    }

    const imageResult = await imageResponse.json();
    if (imageResult.error) {
      throw new Error(`Erro do Redis ao buscar imagem: ${imageResult.error}`);
    }

    if (imageResult.result === null) {
      console.log(`❌ Nenhuma imagem encontrada para a chave: ${imageKey}`);
      return { success: true, data: null };
    }

    // Buscar atribuição
    const attributionResponse = await fetch(
      `${redisUrl.trim()}/get/${encodeURIComponent(attributionKey)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${redisToken.trim()}`,
          "Content-Type": "application/json",
        },
      },
    );

    let attribution = null;
    if (attributionResponse.ok) {
      const attributionResult = await attributionResponse.json();
      if (!attributionResult.error && attributionResult.result !== null) {
        attribution = attributionResult.result;
      }
    }

    console.log(`✅ Dados encontrados no Redis - URL: ${imageKey}`);
    return {
      success: true,
      data: {
        imageUrl: imageResult.result,
        attribution: attribution,
      },
    };
  } catch (error) {
    console.error("❌ Erro ao buscar no Redis:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao buscar no Redis",
    };
  }
}
