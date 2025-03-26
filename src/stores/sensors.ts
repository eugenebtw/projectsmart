import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { localStorageService, StorageKeys } from '../services/local-storage';

interface SensorData {
  timestamp: Date;
  value: number;
}

export const useSensorsStore = defineStore('sensors', () => {
  // Загрузка данных из localStorage или использование пустых значений
  let savedSensorData: { temperatureData: Record<string, SensorData[]>, humidityData: Record<string, SensorData[]> } | null = null;
  
  try {
    const savedData = localStorage.getItem(StorageKeys.SENSOR_DATA);
    if (savedData) {
      // При загрузке из localStorage нужно преобразовать строки дат обратно в объекты Date
      const parsedData = JSON.parse(savedData, (key, value) => {
        if (key === 'timestamp' && typeof value === 'string') {
          return new Date(value);
        }
        return value;
      });
      savedSensorData = parsedData;
    }
  } catch (error) {
    console.error('Error loading sensor data from localStorage:', error);
  }
  
  // Данные температуры по комнатам
  const temperatureData = ref<Record<string, SensorData[]>>(
    savedSensorData ? savedSensorData.temperatureData : {}
  );
  
  // Данные влажности по комнатам
  const humidityData = ref<Record<string, SensorData[]>>(
    savedSensorData ? savedSensorData.humidityData : {}
  );

  // Получить все данные о температуре
  const getAllTemperatureData = computed(() => {
    return Object.entries(temperatureData.value).map(([roomId, data]) => ({
      roomId,
      data
    }));
  });

  // Получить все данные о влажности
  const getAllHumidityData = computed(() => {
    return Object.entries(humidityData.value).map(([roomId, data]) => ({
      roomId,
      data
    }));
  });

  // Получить данные температуры для конкретной комнаты
  const getTemperatureData = (roomId: string): SensorData[] => {
    return temperatureData.value[roomId] || [];
  };

  // Получить данные влажности для конкретной комнаты
  const getHumidityData = (roomId: string): SensorData[] => {
    return humidityData.value[roomId] || [];
  };

  // Добавить запись о температуре
  const addTemperatureData = (roomId: string, data: SensorData) => {
    if (!temperatureData.value[roomId]) {
      temperatureData.value[roomId] = [];
    }
    temperatureData.value[roomId].push(data);
    
    // Ограничиваем количество записей (например, храним только за 24 часа)
    if (temperatureData.value[roomId].length > 24) {
      temperatureData.value[roomId].shift();
    }
  };

  // Добавить запись о влажности
  const addHumidityData = (roomId: string, data: SensorData) => {
    if (!humidityData.value[roomId]) {
      humidityData.value[roomId] = [];
    }
    humidityData.value[roomId].push(data);
    
    // Ограничиваем количество записей
    if (humidityData.value[roomId].length > 24) {
      humidityData.value[roomId].shift();
    }
  };
  
  // Очистить данные для комнаты
  const clearRoomData = (roomId: string) => {
    if (temperatureData.value[roomId]) {
      delete temperatureData.value[roomId];
    }
    
    if (humidityData.value[roomId]) {
      delete humidityData.value[roomId];
    }
  };

  // Сохраняем данные в localStorage при изменении
  watch(
    [temperatureData, humidityData],
    ([newTempData, newHumidityData]) => {
      try {
        localStorage.setItem(
          StorageKeys.SENSOR_DATA, 
          JSON.stringify({
            temperatureData: newTempData,
            humidityData: newHumidityData
          })
        );
      } catch (error) {
        console.error('Error saving sensor data to localStorage:', error);
      }
    },
    { deep: true }
  );

  return {
    getAllTemperatureData,
    getAllHumidityData,
    getTemperatureData,
    getHumidityData,
    addTemperatureData,
    addHumidityData,
    clearRoomData
  };
});
