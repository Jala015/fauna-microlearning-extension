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

interface BackgroundResponse {
  success: boolean;
  error?: string;
  data?: any;
}

export default defineBackground(() => {
  console.log("Background script iniciado", { id: browser.runtime.id });

  // Escutar mensagens do content script
  browser.runtime.onMessage.addListener((message: any, sender: any) => {
    if (message.action === "saveImage") {
      return saveImageToRedis(message as SaveImageMessage);
    } else if (message.action === "getImage") {
      return getImageFromRedis(message as GetImageMessage);
    }
    return Promise.resolve({ success: false, error: "Ação não reconhecida" });
  });
});

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
