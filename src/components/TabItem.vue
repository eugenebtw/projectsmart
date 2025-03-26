<template>
    <div v-if="active" class="tab-item">
      <slot></slot>
    </div>
  </template>
  
  <script setup lang="ts">
  import { inject, onMounted, ref, watch } from 'vue';
  
  // Определяем свойства компонента
  const props = defineProps<{
    title: string;
    icon?: string;
  }>();
  
  // Инъекция функции регистрации вкладки из родительского компонента
  const registerTab = inject<(title: string, icon?: string) => number>('registerTab');
  const tabIndex = ref(-1);
  const active = ref(false);
  
  // При монтировании регистрируем вкладку
  onMounted(() => {
    if (registerTab) {
      tabIndex.value = registerTab(props.title, props.icon);
    }
  });
  </script>
  
  <style scoped>
  .tab-item {
    padding: 5px;
  }
  </style>
  