<script setup lang="ts">
export type Marker = {
  text: string
  page: number
  x: number
  y: number
  w: number
  h: number
}

const marker = defineModel<Marker>({ required: true })

defineProps<{ maxPage: number; pageNote?: string }>()
</script>

<template>
  <fieldset class="marker-control">
    <legend>Place a marker</legend>

    <label>
      Text
      <input v-model="marker.text" data-testid="marker-text" type="text" />
    </label>

    <label>
      Page <output data-testid="marker-page-value">{{ marker.page }}</output>
      <input
        v-model.number="marker.page"
        data-testid="marker-page"
        :max="maxPage"
        min="1"
        step="1"
        type="range"
      />
      <span v-if="pageNote" class="note">{{ pageNote }}</span>
    </label>

    <label>
      X <output data-testid="marker-x-value">{{ marker.x }}%</output>
      <input
        v-model.number="marker.x"
        data-testid="marker-x"
        max="100"
        min="0"
        step="1"
        type="range"
      />
    </label>

    <label>
      Y <output data-testid="marker-y-value">{{ marker.y }}%</output>
      <input
        v-model.number="marker.y"
        data-testid="marker-y"
        max="100"
        min="0"
        step="1"
        type="range"
      />
    </label>

    <label>
      W <output data-testid="marker-w-value">{{ marker.w }}%</output>
      <input
        v-model.number="marker.w"
        data-testid="marker-w"
        max="100"
        min="1"
        step="1"
        type="range"
      />
    </label>

    <label>
      H <output data-testid="marker-h-value">{{ marker.h }}%</output>
      <input
        v-model.number="marker.h"
        data-testid="marker-h"
        max="100"
        min="1"
        step="1"
        type="range"
      />
    </label>
  </fieldset>
</template>

<style scoped>
.marker-control {
  margin-bottom: 10px;
  padding: 6px 10px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
}

legend {
  padding: 0 4px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

label {
  display: block;
  margin-bottom: 8px;
}

input[type='range'] {
  width: 160px;
  vertical-align: middle;
}

.note {
  color: #a00;
  font-size: 12px;
}
</style>
