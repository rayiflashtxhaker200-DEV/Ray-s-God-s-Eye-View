<script setup>
defineProps({
  items: { type: Array, default: () => [] },
  active: { type: String, default: null },
  side: { type: String, default: 'left' },
  label: { type: String, default: '' },
  panelOpen: { type: Boolean, default: false },
  collapsible: { type: Boolean, default: false },
});

const emit = defineEmits(['select']);
</script>

<template>
  <nav
    class="gev-rail"
    :class="[
      `gev-rail--${side}`,
      { 'gev-rail--panel-open': panelOpen, 'gev-rail--collapsible': collapsible },
    ]"
    :aria-label="label"
  >
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="gev-rail-btn"
      :class="{ active: active === item.id }"
      :aria-pressed="String(active === item.id)"
      :aria-label="item.label"
      :title="item.label"
      @click="emit('select', item.id)"
    >
      <span class="material-symbols-outlined" aria-hidden="true">{{
        item.icon
      }}</span>
    </button>
  </nav>
</template>
