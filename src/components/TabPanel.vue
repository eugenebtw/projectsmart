<template>
    <div class="tab-panel">
      <div class="tab-headers">
        <button 
          v-for="(tab, index) in tabs" 
          :key="index"
          :class="[
            'tab-header', 
            { active: activeTab === index }
          ]"
          @click="selectTab(index)"
        >
          <i v-if="tab.icon" :class="tab.icon" class="tab-icon"></i>
          {{ tab.title }}
        </button>
      </div>
      
      <div class="tab-content">
        <div 
          v-for="(tab, index) in tabs" 
          :key="index"
          :class="['tab-pane', { active: activeTab === index }]"
        >
          <slot v-if="activeTab === index" :name="indexToName(index)"></slot>
        </div>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, onMounted, provide, reactive } from 'vue';
  
  // Состояние компонента
  const activeTab = ref(0);
  const tabs = reactive<{title: string, icon?: string}[]>([]);
  
  // Предоставляем API для дочерних компонентов TabItem
  provide('registerTab', (title: string, icon?: string) => {
    tabs.push({ title, icon });
    return tabs.length - 1; // Возвращаем индекс добавленной вкладки
  });
  
  // Переключение вкладок
  const selectTab = (index: number) => {
    activeTab.value = index;
  };
  
  // Преобразование индекса в имя слота
  const indexToName = (index: number): string => {
    return `tab-${index}`;
  };
  
  // При монтировании активируем первую вкладку
  onMounted(() => {
    activeTab.value = 0;
  });
  </script>
  
  <style scoped>
  .tab-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  
  .tab-headers {
    display: flex;
    overflow-x: auto;
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 15px;
  }
  
  .tab-header {
    padding: 10px 15px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-color);
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  
  .tab-header:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  .tab-header.active {
    border-bottom-color: var(--accent-color);
    color: var(--accent-color);
  }
  
  .tab-icon {
    font-size: 16px;
  }
  
  .tab-content {
    flex: 1;
    overflow-y: auto;
    position: relative;
  }
  
  .tab-pane {
    display: none;
    animation: fadeIn 0.3s ease;
  }
  
  .tab-pane.active {
    display: block;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  /* Адаптивные стили для мобильных устройств */
  @media (max-width: 768px) {
    .tab-header {
      padding: 8px 12px;
      font-size: 13px;
    }
    
    .tab-icon {
      font-size: 14px;
    }
  }
  </style>
  