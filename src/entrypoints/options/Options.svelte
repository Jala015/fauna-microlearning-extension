<script>
  import { onMount } from "svelte";

  let redisUrl = "";
  let redisToken = "";
  let saving = false;
  let message = "";
  let testingConnection = false;

  onMount(async () => {
    // Carregar configurações salvas
    const result = await browser.storage.sync.get(["redisUrl", "redisToken"]);
    redisUrl = result.redisUrl || "";
    redisToken = result.redisToken || "";
  });

  async function saveConfig() {
    saving = true;
    message = "";

    try {
      await browser.storage.sync.set({
        redisUrl: redisUrl.trim(),
        redisToken: redisToken.trim(),
      });

      message = "✅ Configurações salvas com sucesso!";
      setTimeout(() => (message = ""), 3000);
    } catch (error) {
      message = "❌ Erro ao salvar configurações";
      console.error(error);
    } finally {
      saving = false;
    }
  }

  async function testConnection() {
    if (!redisUrl || !redisToken) {
      message = "⚠️ Preencha URL e Token primeiro";
      return;
    }

    testingConnection = true;
    message = "";

    try {
      const response = await fetch(`${redisUrl.trim()}/ping`, {
        headers: {
          Authorization: `Bearer ${redisToken.trim()}`,
        },
      });

      if (response.ok) {
        message = "✅ Conexão funcionando perfeitamente!";
      } else {
        message = "❌ Erro na conexão - verifique URL e Token";
      }
    } catch (error) {
      message = "❌ Erro ao testar conexão";
      console.error(error);
    } finally {
      testingConnection = false;
    }

    setTimeout(() => (message = ""), 5000);
  }
</script>

<main class="font-sans m-0 bg-gray-100 min-h-screen">
  <div class="max-w-lg mx-auto py-10 px-8 bg-white rounded-xl shadow-lg mt-10">
    <h1 class="text-gray-800 text-2xl font-bold mb-2">
      🎯 Fauna Microlearning Extension
    </h1>
    <p class="text-gray-600 mb-8">
      Configure sua conexão com o Redis (Upstash) para salvar imagens curadas.
    </p>

    <div class="mb-6">
      <label for="redis-url" class="block font-semibold text-gray-800 mb-2"
        >URL do Redis:</label
      >
      <input
        id="redis-url"
        type="url"
        bind:value={redisUrl}
        placeholder="https://your-redis-name.upstash.io"
        required
        class="w-full p-3 border-2 border-gray-300 rounded-lg text-sm transition-colors duration-200 focus:outline-none focus:border-indigo-400"
      />
      <small class="block text-gray-400 mt-1.5 text-xs"
        >Exemplo: https://sua-database.upstash.io</small
      >
    </div>

    <div class="mb-6">
      <label for="redis-token" class="block font-semibold text-gray-800 mb-2"
        >Token de Escrita:</label
      >
      <input
        id="redis-token"
        type="password"
        bind:value={redisToken}
        placeholder="seu-token-com-permissao-de-escrita"
        required
        class="w-full p-3 border-2 border-gray-300 rounded-lg text-sm transition-colors duration-200 focus:outline-none focus:border-indigo-400"
      />
      <small class="block text-gray-400 mt-1.5 text-xs"
        >Use um token com permissões de SET para escrever no Redis</small
      >
    </div>

    <div class="flex gap-3 mb-5">
      <button
        on:click={testConnection}
        disabled={testingConnection || !redisUrl || !redisToken}
        class="flex-1 p-3 px-5 border-none rounded-lg font-semibold cursor-pointer transition-all duration-200 text-sm bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {#if testingConnection}
          🔄 Testando...
        {:else}
          🧪 Testar Conexão
        {/if}
      </button>

      <button
        on:click={saveConfig}
        disabled={saving || !redisUrl || !redisToken}
        class="flex-1 p-3 px-5 border-none rounded-lg font-semibold cursor-pointer transition-all duration-200 text-sm bg-green-500 text-white hover:bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {#if saving}
          💾 Salvando...
        {:else}
          💾 Salvar Configurações
        {/if}
      </button>
    </div>

    {#if message}
      <div
        class="p-3 rounded-lg font-medium text-center {message.includes('✅')
          ? 'bg-green-100 text-green-800'
          : message.includes('❌')
            ? 'bg-red-100 text-red-800'
            : message.includes('⚠️')
              ? 'bg-yellow-100 text-yellow-800'
              : ''}"
      >
        {message}
      </div>
    {/if}
  </div>
</main>
