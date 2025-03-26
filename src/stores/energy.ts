import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { localStorageService, StorageKeys } from '../services/local-storage';

interface PowerData {
  timestamp: Date;
  value: number;
}

export const useEnergyStore = defineStore('energy', () => {
  // Загрузка данных из localStorage или использование пустого массива
  let savedPowerData: PowerData[] | null = null;
  
  try {
    const savedData = localStorage.getItem(StorageKeys.ENERGY_DATA);
    if (savedData) {
      // При загрузке из localStorage нужно преобразовать строки дат обратно в объекты Date
      savedPowerData = JSON.parse(savedData, (key, value) => {
        if (key === 'timestamp' && typeof value === 'string') {
          return new Date(value);
        }
        return value;
      });
    }
  } catch (error) {
    console.error('Error loading energy data from localStorage:', error);
  }
  
  // Данные о потреблении энергии
  const powerData = ref<PowerData[]>(savedPowerData || []);

  // Получить данные о потреблении энергии
  const getPowerData = (): PowerData[] => {
    return powerData.value;
  };

  // Добавить запись о потреблении энергии
  const addPowerData = (data: PowerData) => {
    powerData.value.push(data);
    
    // Ограничиваем количество записей
    if (powerData.value.length > 24) {
      powerData.value.shift();
    }
  };

  // Очистить данные
  const clearPowerData = () => {
    powerData.value = [];
  };
  
  // Сохраняем данные в localStorage при изменении
  watch(
    powerData,
    (newPowerData) => {
      try {
        localStorage.setItem(StorageKeys.ENERGY_DATA, JSON.stringify(newPowerData));
      } catch (error) {
        console.error('Error saving energy data to localStorage:', error);
      }
    },
    { deep: true }
  );

  return {
    getPowerData,
    addPowerData,
    clearPowerData
  };
});
