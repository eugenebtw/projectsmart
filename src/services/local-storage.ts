import type { Room, SmartDevice } from '../types';

/**
 * Ключи для хранения данных в localStorage
 */
export enum StorageKeys {
  ROOMS = 'smartHome_rooms',
  THEME = 'smartHome_theme',
  SENSOR_DATA = 'smartHome_sensorData',
  ENERGY_DATA = 'smartHome_energyData'
}

/**
 * Сервис для работы с localStorage
 */
export const localStorageService = {
  /**
   * Сохраняет данные комнат в localStorage
   * @param rooms Массив комнат
   */
  saveRooms(rooms: Room[]): void {
    try {
      localStorage.setItem(StorageKeys.ROOMS, JSON.stringify(rooms));
    } catch (error) {
      console.error('Failed to save rooms to localStorage:', error);
    }
  },

  /**
   * Загружает данные комнат из localStorage
   * @returns Массив комнат или null, если данные не найдены
   */
  loadRooms(): Room[] | null {
    try {
      const roomsData = localStorage.getItem(StorageKeys.ROOMS);
      if (!roomsData) return null;
      
      return JSON.parse(roomsData);
    } catch (error) {
      console.error('Failed to load rooms from localStorage:', error);
      return null;
    }
  },

  /**
   * Сохраняет состояние устройства в localStorage
   * @param device Устройство
   */
  saveDeviceState(device: SmartDevice): void {
    try {
      // Загружаем текущие комнаты
      const rooms = this.loadRooms();
      if (!rooms) return;
      
      // Находим комнату с устройством
      const roomIndex = rooms.findIndex(room => 
        room.devices.some(d => d.id === device.id)
      );
      
      if (roomIndex === -1) return;
      
      // Находим устройство в комнате
      const deviceIndex = rooms[roomIndex].devices.findIndex(d => 
        d.id === device.id
      );
      
      if (deviceIndex === -1) return;
      
      // Обновляем устройство
      rooms[roomIndex].devices[deviceIndex] = device;
      
      // Сохраняем обновленные комнаты
      this.saveRooms(rooms);
    } catch (error) {
      console.error('Failed to save device state to localStorage:', error);
    }
  },

  /**
   * Сохраняет тему приложения в localStorage
   * @param isDark Флаг темной темы
   */
  saveTheme(isDark: boolean): void {
    try {
      localStorage.setItem(StorageKeys.THEME, String(isDark));
    } catch (error) {
      console.error('Failed to save theme to localStorage:', error);
    }
  },

  /**
   * Загружает тему приложения из localStorage
   * @returns Флаг темной темы или null, если данные не найдены
   */
  loadTheme(): boolean | null {
    try {
      const theme = localStorage.getItem(StorageKeys.THEME);
      if (theme === null) return null;
      
      return theme === 'true';
    } catch (error) {
      console.error('Failed to load theme from localStorage:', error);
      return null;
    }
  },

  /**
   * Очищает все данные приложения из localStorage
   */
  clearAllData(): void {
    try {
      localStorage.removeItem(StorageKeys.ROOMS);
      localStorage.removeItem(StorageKeys.THEME);
      localStorage.removeItem(StorageKeys.SENSOR_DATA);
      localStorage.removeItem(StorageKeys.ENERGY_DATA);
    } catch (error) {
      console.error('Failed to clear data from localStorage:', error);
    }
  }
};
