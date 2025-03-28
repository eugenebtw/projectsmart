<template>
  <div class="dashboard">
    <header>
      <h1>Умный дом 3D Dashboard</h1>
      <button class="theme-toggle" @click="toggleTheme">
        {{ isDarkTheme ? 'Светлая тема' : 'Темная тема' }}
      </button>
    </header>
    
    <div class="main-content">
      <div class="scene-container">
        <HouseScene />
      </div>
      <div class="control-panels">
        <DeviceController />
        <SensorChart />
      </div>
    </div>
    
    <NotificationSystem />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from 'vue';
import DeviceDragDrop from './components/DeviceDragDrop.vue';
import HouseScene from './components/HouseScene.vue';
import DeviceController from './components/DeviceController.vue';
import SensorChart from './components/SensorChart.vue';
import NotificationSystem from './components/NotificationSystem.vue';
import EnergyChart from './components/EnergyChart.vue';
import RoomCreator from './components/RoomCreator.vue';
import TabItem from './components/TabItem.vue';
import TabPanel from './components/TabPanel.vue';

export default defineComponent({
  name: 'App',
  components: {
    HouseScene,
    DeviceController,
    SensorChart,
    NotificationSystem,
    DeviceDragDrop,
    EnergyChart,
    RoomCreator,
    TabItem,
    TabPanel
  },
  setup() {
    const isDarkTheme = ref(false);
    
    const toggleTheme = () => {
      isDarkTheme.value = !isDarkTheme.value;
      document.documentElement.classList.toggle('dark-theme', isDarkTheme.value);
    };
    
    // Проверяем предпочтения пользователя по цветовой схеме
    onMounted(() => {
      // Проверяем, предпочитает ли пользователь тёмную тему
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        isDarkTheme.value = true;
        document.documentElement.classList.add('dark-theme');
      }
      
      // Добавляем класс на body для индикации, что приложение загружено
      document.body.classList.add('app-loaded');
    });
    
    return {
      isDarkTheme,
      toggleTheme
    };
  },
});
</script>

<style>
:root {
  --accent-color: #2196f3;
  --text-color: #333;
  --bg-color: #f5f5f5;
  --card-bg: #fff;
  --border-color: #e0e0e0;
  --card-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  --danger-color: #f44336;
  --success-color: #4caf50;
}

.dark-theme {
  --accent-color: #64b5f6;
  --text-color: #f5f5f5;
  --bg-color: #121212;
  --card-bg: #1e1e1e;
  --border-color: #333;
  --card-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

body {
  margin: 0;
  font-family: 'Roboto', Arial, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-color);
  transition: background-color 0.3s, color 0.3s;
}

.dashboard {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  height: calc(100vh - 40px); /* Полная высота минус padding */
  display: flex;
  flex-direction: column;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

h1 {
  margin: 0;
  font-size: 24px;
  color: var(--accent-color);
}

.theme-toggle {
  padding: 8px 15px;
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.main-content {
  display: flex;
  gap: 20px;
  flex: 1;
  min-height: 0; /* Важно для корректной работы flex и overflow */
}

.scene-container {
  flex: 1;
  min-height: 500px;
  height: 100%; /* Явно указываем высоту */
  background-color: var(--card-bg);
  border-radius: 8px;
  box-shadow: var(--card-shadow);
  overflow: hidden;
  position: relative; /* Для позиционирования внутренних элементов */
}

.control-panels {
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto; /* Разрешаем прокрутку, если панели большие */
}

/* Отключаем дефолтную анимацию для улучшения производительности при инициализации сцены */
.app-loaded * {
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
}

/* Responsive design */
@media (max-width: 1024px) {
  .main-content {
    flex-direction: column;
  }
  
  .scene-container {
    height: 50vh; /* Половина высоты на мобильных */
    min-height: 300px;
  }
  
  .control-panels {
    width: 100%;
  }
}
</style>