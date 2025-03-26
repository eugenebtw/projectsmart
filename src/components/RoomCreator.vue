<template>
    <div class="room-creator">
      <button v-if="!isFormVisible" class="create-button" @click="showForm">
        <i class="fa fa-plus"></i> Добавить комнату
      </button>
      
      <div v-if="isFormVisible" class="creator-form">
        <h3>Создать новую комнату</h3>
        
        <div class="form-group">
          <label for="room-name">Название комнаты:</label>
          <input 
            id="room-name" 
            v-model="roomName" 
            type="text" 
            placeholder="Например: Балкон"
            required
          >
        </div>
        
        <div class="form-group">
          <label for="room-type">Тип комнаты:</label>
          <select id="room-type" v-model="roomType">
            <option value="living">Гостиная</option>
            <option value="bedroom">Спальня</option>
            <option value="kitchen">Кухня</option>
            <option value="bathroom">Ванная</option>
            <option value="other">Другое</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="room-temperature">Начальная температура (°C):</label>
          <input 
            id="room-temperature" 
            v-model.number="roomTemperature" 
            type="number" 
            min="15" 
            max="35" 
            step="0.5"
          >
        </div>
        
        <div class="form-group">
          <label for="room-humidity">Начальная влажность (%):</label>
          <input 
            id="room-humidity" 
            v-model.number="roomHumidity" 
            type="number" 
            min="0" 
            max="100" 
            step="1"
          >
        </div>
        
        <div class="form-actions">
          <button class="cancel-button" @click="cancelForm">Отмена</button>
          <button 
            class="submit-button" 
            @click="createRoom"
            :disabled="!isFormValid"
          >
            Создать
          </button>
        </div>
        
        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, computed } from 'vue';
  import { useHouseStore } from '../stores/house';
  import type { RoomType } from '../types';
  
  const houseStore = useHouseStore();
  
  // Состояние формы
  const isFormVisible = ref(false);
  const roomName = ref('');
  const roomType = ref<RoomType>('living');
  const roomTemperature = ref(22);
  const roomHumidity = ref(50);
  const errorMessage = ref('');
  
  // Проверка валидности формы
  const isFormValid = computed(() => {
    if (!roomName.value.trim()) return false;
    if (roomTemperature.value < 15 || roomTemperature.value > 35) return false;
    if (roomHumidity.value < 0 || roomHumidity.value > 100) return false;
    return true;
  });
  
  // Показать форму
  const showForm = () => {
    isFormVisible.value = true;
    errorMessage.value = '';
  };
  
  // Отменить создание
  const cancelForm = () => {
    isFormVisible.value = false;
    resetForm();
  };
  
  // Сбросить форму
  const resetForm = () => {
    roomName.value = '';
    roomType.value = 'living';
    roomTemperature.value = 22;
    roomHumidity.value = 50;
    errorMessage.value = '';
  };
  
  // Создать новую комнату
  const createRoom = () => {
    if (!isFormValid.value) {
      errorMessage.value = 'Пожалуйста, заполните все поля корректно';
      return;
    }
    
    // Генерируем уникальный ID для комнаты
    const roomId = generateRoomId(roomName.value, roomType.value);
    
    // Проверяем, что комната с таким ID не существует
    if (houseStore.getRoomById(roomId)) {
      errorMessage.value = 'Комната с таким названием уже существует';
      return;
    }
    
    // Создаем комнату
    houseStore.addRoom({
      id: roomId,
      name: roomName.value.trim(),
      type: roomType.value,
      devices: [],
      temperature: roomTemperature.value,
      humidity: roomHumidity.value
    });
    
    // Скрываем форму и сбрасываем её
    isFormVisible.value = false;
    resetForm();
  };
  
  // Генерация ID комнаты на основе названия и типа
  const generateRoomId = (name: string, type: string): string => {
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
    return `${type}-${cleanName}-${Date.now().toString(36)}`;
  };
  </script>
  
  <style scoped>
  .room-creator {
    margin-top: 20px;
  }
  
  .create-button {
    padding: 10px 15px;
    background-color: var(--accent-color);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  
  .create-button:hover {
    background-color: #1976d2;
  }
  
  .creator-form {
    margin-top: 15px;
    padding: 15px;
    background-color: var(--bg-color);
    border-radius: 8px;
    box-shadow: var(--card-shadow);
  }
  
  h3 {
    margin-top: 0;
    margin-bottom: 15px;
    color: var(--text-color);
  }
  
  .form-group {
    margin-bottom: 15px;
  }
  
  label {
    display: block;
    margin-bottom: 5px;
    color: var(--text-color);
    font-size: 14px;
  }
  
  input, select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background-color: var(--bg-color);
    color: var(--text-color);
    font-size: 14px;
  }
  
  input:focus, select:focus {
    outline: none;
    border-color: var(--accent-color);
  }
  
  .form-actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }
  
  .cancel-button, .submit-button {
    padding: 8px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
  }
  
  .cancel-button {
    background-color: var(--border-color);
    color: var(--text-color);
  }
  
  .submit-button {
    background-color: var(--accent-color);
    color: white;
  }
  
  .cancel-button:hover {
    background-color: #e0e0e0;
  }
  
  .submit-button:hover {
    background-color: #1976d2;
  }
  
  .submit-button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
  
  .error-message {
    margin-top: 15px;
    padding: 10px;
    background-color: rgba(244, 67, 54, 0.1);
    border: 1px solid #f44336;
    border-radius: 4px;
    color: #f44336;
    font-size: 14px;
  }
  </style>
  