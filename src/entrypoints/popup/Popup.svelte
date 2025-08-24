<script>
  import { onMount } from "svelte";

  let pageContext = null;
  let savedImageData = null;
  let loading = true;
  let error = null;
  let redisConfigured = false;

  onMount(async () => {
    await checkRedisConfiguration();
    await analyzeCurrentPage();

    if (pageContext?.type === "taxon" && pageContext.speciesKey) {
      await loadSavedImage(pageContext.speciesKey);
    }

    loading = false;
  });

  async function checkRedisConfiguration() {
    try {
      const config = await browser.storage.sync.get(["redisUrl", "redisToken"]);
      redisConfigured = !!(config.redisUrl && config.redisToken);
    } catch (err) {
      console.error("Erro ao verificar configuração:", err);
      redisConfigured = false;
    }
  }

  async function analyzeCurrentPage() {
    try {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const currentTab = tabs[0];

      if (!currentTab?.url) {
        pageContext = { type: "other", url: "" };
        return;
      }

      const url = currentTab.url;

      // Verificar se é página de taxon
      const taxonMatch = url.match(
        /https:\/\/www\.inaturalist\.org\/taxa\/(\d+)/,
      );
      if (taxonMatch) {
        pageContext = {
          type: "taxon",
          speciesKey: taxonMatch[1],
          url,
        };
        return;
      }

      // Verificar se é página de observação
      const observationMatch = url.match(
        /https:\/\/www\.inaturalist\.org\/observations\/(\d+)/,
      );
      if (observationMatch) {
        // Para observações, vamos tentar extrair o taxon_id da página
        const taxonId = await extractTaxonFromObservation(currentTab.id);
        pageContext = {
          type: "observation",
          observationId: observationMatch[1],
          taxonId,
          url,
        };
        return;
      }

      pageContext = { type: "other", url };
    } catch (err) {
      console.error("Erro ao analisar página:", err);
      error = "Erro ao analisar página atual";
      pageContext = { type: "other", url: "" };
    }
  }

  async function extractTaxonFromObservation(tabId) {
    try {
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Tentar encontrar o link para o taxon na página
          const taxonLink = document.querySelector('a[href*="/taxa/"]');
          if (taxonLink && taxonLink.href) {
            const match = taxonLink.href.match(/\/taxa\/(\d+)/);
            if (match) {
              return match[1];
            }
          }

          // Alternativa: buscar no JSON-LD ou meta tags
          const scripts = document.querySelectorAll(
            'script[type="application/ld+json"]',
          );
          for (const script of scripts) {
            try {
              const data = JSON.parse(script.textContent || "");
              if (
                data.about &&
                data.about.url &&
                data.about.url.includes("/taxa/")
              ) {
                const match = data.about.url.match(/\/taxa\/(\d+)/);
                if (match) {
                  return match[1];
                }
              }
            } catch (e) {}
          }

          return null;
        },
      });

      return results[0]?.result || undefined;
    } catch (err) {
      console.error("Erro ao extrair taxon da observação:", err);
      return undefined;
    }
  }

  async function loadSavedImage(speciesKey) {
    try {
      const response = await browser.runtime.sendMessage({
        action: "getImage",
        data: { speciesKey },
      });

      if (response && response.success && response.data) {
        savedImageData = response.data;
      } else {
        savedImageData = null;
      }
    } catch (err) {
      console.error("Erro ao carregar imagem:", err);
      error = "Erro ao carregar imagem salva";
    }
  }

  function navigateToTaxon() {
    if (pageContext?.type === "observation" && pageContext.taxonId) {
      const taxonUrl = `https://www.inaturalist.org/taxa/${pageContext.taxonId}`;
      browser.tabs.create({ url: taxonUrl });
    }
  }

  function openSettings() {
    browser.runtime.openOptionsPage();
  }
</script>

<main class="p-4 min-w-[320px] max-w-[400px] bg-white">
  <!-- Header -->
  <header
    class="flex items-center justify-between mb-4 pb-3 border-b border-gray-200"
  >
    <h1 class="text-xl font-bold text-gray-800 flex items-center gap-2">
      <span class="text-2xl">🔍</span>
      iCurador
    </h1>
    <button
      on:click={openSettings}
      class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      title="Configurações"
    >
      <svg
        class="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        ></path>
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        ></path>
      </svg>
    </button>
  </header>

  <!-- Content -->
  {#if loading}
    <!-- Loading State -->
    <div class="flex items-center justify-center py-8">
      <div
        class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"
      ></div>
      <span class="ml-3 text-gray-600">Carregando...</span>
    </div>
  {:else if !redisConfigured}
    <!-- Redis Not Configured -->
    <div class="text-center py-6">
      <div class="text-6xl mb-4">⚙️</div>
      <h3 class="text-lg font-semibold text-gray-800 mb-2">
        Configuração Necessária
      </h3>
      <p class="text-gray-600 mb-4 text-sm">
        Configure o Redis antes de usar a extensão
      </p>
      <button
        on:click={openSettings}
        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
      >
        Abrir Configurações
      </button>
    </div>
  {:else if error}
    <!-- Error State -->
    <div class="text-center py-6">
      <div class="text-6xl mb-4">❌</div>
      <h3 class="text-lg font-semibold text-red-600 mb-2">Erro</h3>
      <p class="text-gray-600 text-sm">{error}</p>
    </div>
  {:else if pageContext?.type === "taxon"}
    <!-- Taxon Page -->
    <div class="space-y-4">
      <div class="bg-green-50 border border-green-200 rounded-lg p-3">
        <div class="flex items-center gap-2 text-green-800">
          <span class="text-lg">🔬</span>
          <span class="font-medium">Página de Táxon</span>
        </div>
        <p class="text-sm text-green-700 mt-1">ID: {pageContext.speciesKey}</p>
      </div>

      {#if savedImageData && savedImageData.imageUrl}
        <!-- Saved Image -->
        <div class="space-y-3">
          <h3 class="font-semibold text-gray-800 flex items-center gap-2">
            <span class="text-green-600">✅</span>
            Imagem Salva (Creative Commons)
          </h3>
          <div class="border border-gray-200 rounded-lg overflow-hidden">
            <img
              src={savedImageData.imageUrl}
              alt="Imagem salva do táxon"
              class="w-full h-48 object-cover bg-gray-100"
              on:error={(e) => {
                if (e.target && e.target.src) {
                  e.target.src =
                    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjRjNGNEY2Ci8+CjxwYXRoIGQ9Ik0xMiA5VjEzTTEyIDE3SDEyLjAxTTIxIDEyQTkgOSAwIDExMyAxMkE5IDkgMCAwMTIxIDEyWiIgc3Ryb2tlPSIjOUI5QkEwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4K";
                }
              }}
            />
            <div class="p-3 bg-gray-50 space-y-2">
              {#if savedImageData.attribution}
                <div
                  class="text-sm text-gray-700 border-l-4 border-green-500 pl-3"
                >
                  <p class="font-medium text-green-700 mb-1">📄 Atribuição:</p>
                  <p class="italic">{savedImageData.attribution}</p>
                </div>
              {/if}
              <div class="text-xs text-gray-500">
                <p class="font-medium mb-1">🔗 URL:</p>
                <p class="break-all">{savedImageData.imageUrl}</p>
              </div>
            </div>
          </div>
        </div>
      {:else}
        <!-- No Saved Image -->
        <div class="text-center py-6">
          <div class="text-4xl mb-3">📷</div>
          <h3 class="font-semibold text-gray-700 mb-2">Nenhuma imagem salva</h3>
          <p class="text-sm text-gray-600 mb-2">
            Navegue pelas fotos na página e use o botão 💎 para salvar uma
            imagem
          </p>
          <div
            class="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg p-2 mt-3"
          >
            <p class="font-medium">ℹ️ Nota:</p>
            <p>Apenas imagens com licença Creative Commons podem ser salvas</p>
          </div>
        </div>
      {/if}
    </div>
  {:else if pageContext?.type === "observation"}
    <!-- Observation Page -->
    <div class="space-y-4">
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div class="flex items-center gap-2 text-blue-800">
          <span class="text-lg">🔍</span>
          <span class="font-medium">Página de Observação</span>
        </div>
        <p class="text-sm text-blue-700 mt-1">
          ID: {pageContext.observationId}
        </p>
      </div>

      {#if pageContext.taxonId}
        <div class="space-y-3">
          <h3 class="font-semibold text-gray-800">Táxon Identificado</h3>
          <p class="text-sm text-gray-600 mb-3">
            ID do Táxon: {pageContext.taxonId}
          </p>
          <button
            on:click={navigateToTaxon}
            class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <span>🔬</span>
            Ver Página do Táxon
          </button>
        </div>
      {:else}
        <div class="text-center py-4">
          <div class="text-3xl mb-2">❓</div>
          <p class="text-sm text-gray-600">
            Não foi possível identificar o táxon desta observação
          </p>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Other Page -->
    <div class="text-center py-6">
      <div class="text-4xl mb-4">🌐</div>
      <h3 class="font-semibold text-gray-700 mb-2">Página não suportada</h3>
      <p class="text-sm text-gray-600 mb-4">
        Esta extensão funciona apenas em páginas de táxons e observações do
        iNaturalist
      </p>
      <div class="text-xs text-gray-500 space-y-1">
        <p>• /taxa/[id] - Páginas de táxons</p>
        <p>• /observations/[id] - Páginas de observações</p>
      </div>
    </div>
  {/if}
</main>

<style>
  /* Garantir que imagens quebradas tenham um placeholder decente */
  img[src=""] {
    display: none;
  }
</style>
