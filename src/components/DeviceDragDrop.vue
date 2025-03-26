<template>
    <div class="device-drag-drop">
      <h3>Добавьте новые устройства</h3>
      <p class="instructions">Перетащите устройство в комнату на 3D-сцене</p>
      
      <div class="device-palette">
        <div 
          v-for="device in availableDevices" 
          :key="device.type"
          class="device-item"
          draggable="true"
          @dragstart="onDragStart($event, device.type)"
        >
          <div class="device-icon" :class="device.type">
            <i :class="device.icon"></i>
          </div>
          <div class="device-name">{{ device.name }}</div>
        </div>
      </div>
      
      <div v-if="isDragging" class="drag-indicator">
        <p>Перетащите на комнату, чтобы добавить {{ draggedDeviceName }}</p>
      </div>
      
      <div v-if="showSuccessMessage" class="success-message">
        <p>{{ successMessage }}</p>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, computed } from 'vue';
  import { useHouseStore } from '../stores/house';
  import { DeviceType } from '../types';
  
  const houseStore = useHouseStore();
  
  // Доступные для добавления устройства
  const availableDevices = [
    { 
      type: 'light' as DeviceType, 
      name: 'Освещение', 
      icon: 'fa fa-lightbulb',
      power: 40
    },
    { 
      type: 'fan' as DeviceType, 
      name: 'Вентилятор', 
      icon: 'fa fa-fan',
      power: 45
    },
    { 
      type: 'thermostat' as DeviceType, 
      name: 'Термостат', 
      icon: 'fa fa-temperature-high',
      power: 35
    },
    { 
      type: 'socket' as DeviceType, 
      name: 'Розетка', 
      icon: 'fa fa-plug',
      power: 0
    }
  ];
  
  // Состояние перетаскивания
  const isDragging = ref(false);
  const draggedDeviceType = ref<DeviceType | null>(null);
  
  // Сообщение об успешном добавлении
  const showSuccessMessage = ref(false);
  const successMessage = ref('');
  
  // Получаем название перетаскиваемого устройства
  const draggedDeviceName = computed(() => {
    if (!draggedDeviceType.value) return '';
    
    const device = availableDevices.find(d => d.type === draggedDeviceType.value);
    return device ? device.name : '';
  });
  
  // Начало перетаскивания
  const onDragStart = (event: DragEvent, deviceType: DeviceType) => {
    if (!event.dataTransfer) return;
    
    // Устанавливаем данные для перетаскивания
    event.dataTransfer.setData('application/device', deviceType);
    event.dataTransfer.effectAllowed = 'copy';
    
    // Устанавливаем состояние перетаскивания
    isDragging.value = true;
    draggedDeviceType.value = deviceType;
    
    // Информируем компонент HouseScene о начале перетаскивания
    window.dispatchEvent(new CustomEvent('device-drag-start', { 
      detail: { deviceType } 
    }));
  };
  
  // Настраиваем слушатель для обработки события добавления устройства
  window.addEventListener('device-dropped', ((event: CustomEvent) => {
    const { deviceType, roomId } = event.detail;
    
    if (deviceType && roomId) {
      // Находим параметры устройства
      const deviceTemplate = availableDevices.find(d => d.type === deviceType);
      if (!deviceTemplate) return;
      
      // Генерируем уникальный ID для нового устройства
      const deviceId = `${deviceType}-${Date.now()}`;
      
      // Добавляем устройство в комнату через хранилище
      houseStore.addDevice({
        id: deviceId,
        type: deviceType,
        name: deviceTemplate.name,
        roomId,
        isOn: false,
        power: deviceTemplate.power
      });
      
      // Показываем сообщение об успешном добавлении
      const room = houseStore.getRoomById(roomId);
      successMessage.value = `${deviceTemplate.name} добавлен(а) в комнату "${room?.name || roomId}"`;
      showSuccessMessage.value = true;
      
      // Скрываем сообщение через 3 секунды
      setTimeout(() => {
        showSuccessMessage.value = false;
      }, 3000);
    }
    
    // Сбрасываем состояние перетаскивания
    isDragging.value = false;
    draggedDeviceType.value = null;
  }) as EventListener);
  
  // Очищаем состояние, если перетаскивание закончилось вне цели
  window.addEventListener('device-drag-end', () => {
    isDragging.value = false;
    draggedDeviceType.value = null;
  });
  </script>
  
  <style scoped>
  .device-drag-drop {
    margin-top: 20px;
    padding: 15px;
    background-color: var(--bg-color);
    border-radius: 8px;
    box-shadow: var(--card-shadow);
  }
  
  h3 {
    margin-top: 0;
    margin-bottom: 10px;
    color: var(--text-color);
  }
  
  .instructions {
    margin-bottom: 15px;
    color: var(--text-color);
    font-size: 14px;
    opacity: 0.8;
  }
  
  .device-palette {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    justify-content: center;
  }
  
  .device-item {
    width: 80px;
    height: 90px;
    border: 2px dashed var(--border-color);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: grab;
    padding: 8px;
    transition: all 0.2s ease;
  }
  
  .device-item:hover {
    transform: scale(1.05);
    border-color: var(--accent-color);
  }
  
  .device-item:active {
    cursor: grabbing;
    transform: scale(1.1);
  }
  
  .device-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: var(--accent-color);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
    color: white;
    font-size: 18px;
  }
  
  .device-icon.light {
    background-color: #ffc107;
  }
  
  .device-icon.fan {
    background-color: #2196f3;
  }
  
  .device-icon.thermostat {
    background-color: #f44336;
  }
  
  .device-icon.socket {
    background-color: #4caf50;
  }
  
  .device-name {
    font-size: 12px;
    text-align: center;
    color: var(--text-color);
  }
  
  .drag-indicator {
    margin-top: 15px;
    padding: 10px;
    background-color: rgba(33, 150, 243, 0.1);
    border: 1px solid var(--accent-color);
    border-radius: 4px;
    color: var(--accent-color);
    font-size: 14px;
    text-align: center;
  }
  
  .success-message {
    margin-top: 15px;
    padding: 10px;
    background-color: rgba(76, 175, 80, 0.1);
    border: 1px solid #4caf50;
    border-radius: 4px;
    color: #4caf50;
    font-size: 14px;
    text-align: center;
    animation: fade-in 0.3s ease-in;
  }
  
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  /* Адаптивные стили для мобильных устройств */
  @media (max-width: 768px) {
    .device-palette {
      gap: 10px;
    }
    
    .device-item {
      width: 70px;
      height: 80px;
    }
    
    .device-icon {
      width: 35px;
      height: 35px;
      font-size: 16px;
    }
    
    .device-name {
      font-size: 11px;
    }
  }
  </style>
  