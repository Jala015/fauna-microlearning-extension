<script>
  export let className = "";
  let count = 0;

  function increment() {
    count += 1;
  }
</script>

<button class={className} onclick={increment}>
  clicks: {count}
</button>
