<script setup lang="ts">
export type Dependency = {
  name: string
  version: string
  license: string
  url: string
  size: string
  updated: string
  note: string
}

defineProps<{
  deps: Dependency[]
  download: string
  added: string
}>()
</script>

<template>
  <section class="deps" data-testid="dependencies">
    <h3>Dependencies introduced</h3>

    <p class="totals">
      <strong>{{ download }}</strong> downloaded for this page &middot;
      <strong>{{ added }}</strong> added to the bundle beyond the shared Vue baseline.
    </p>

    <p v-if="!deps.length" data-testid="deps-none">
      <strong>None.</strong> This page ships no PDF library at all — the browser is the dependency.
    </p>

    <ul v-else>
      <li v-for="dep in deps" :key="dep.name" data-testid="dep">
        <a :href="dep.url" rel="noopener" target="_blank"><code>{{ dep.name }}</code></a>
        <span class="meta">
          {{ dep.version }} &middot; {{ dep.license }} &middot; {{ dep.size }} &middot; last
          release {{ dep.updated }}
        </span>
        <br />
        {{ dep.note }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.deps {
  margin-top: 18px;
  padding: 10px 12px;
  border-top: 2px solid #ccc;
  font-size: 13px;
}

h3 {
  margin: 0 0 6px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.totals {
  margin: 0 0 8px;
  color: #555;
}

ul {
  margin: 0;
  padding-left: 18px;
}

li {
  margin-bottom: 8px;
}

.meta {
  margin-left: 6px;
  color: #666;
  font-size: 12px;
}
</style>
