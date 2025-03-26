// src/services/api.ts
import axios from 'axios';
import type { Room, SmartDevice, SensorData, EnergyData } from '../types';

const API_URL = '/api';

// Создаем экземпляр axios с базовым URL
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const apiService = {
  // Получение списка устройств
  async getDevices(): Promise<SmartDevice[]> {
    try {
      const response = await api.get<SmartDevice[]>('/devices');
      return response.data;
    } catch (error) {
      console.error('Error fetching devices:', error);
      return [];
    }
  },

  // Получение устройства по ID
  async getDeviceById(id: string): Promise<SmartDevice | null> {
    try {
      const response = await api.get<SmartDevice>(`/devices/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching device ${id}:`, error);
      return null;
    }
  },

  // Обновление устройства
  async updateDevice(device: SmartDevice): Promise<boolean> {
    try {
      await api.put(`/devices/${device.id}`, device);
      return true;
    } catch (error) {
      console.error(`Error updating device ${device.id}:`, error);
      return false;
    }
  },

  // Переключение состояния устройства
  async toggleDevice(id: string): Promise<boolean> {
    try {
      const device = await this.getDeviceById(id);
      if (!device) return false;
      
      device.isOn = !device.isOn;
      return this.updateDevice(device);
    } catch (error) {
      console.error(`Error toggling device ${id}:`, error);
      return false;
    }
  },

  // Получение списка комнат
  async getRooms(): Promise<Room[]> {
    try {
      const response = await api.get<Room[]>('/rooms');
      return response.data;
    } catch (error) {
      console.error('Error fetching rooms:', error);
      return [];
    }
  },

  // Получение комнаты по ID
  async getRoomById(id: string): Promise<Room | null> {
    try {
      const response = await api.get<Room>(`/rooms/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching room ${id}:`, error);
      return null;
    }
  },

  // Получение данных датчиков для комнаты
  async getRoomSensorData(roomId: string, period: string = '24h'): Promise<SensorData[]> {
    try {
      const response = await api.get<SensorData[]>(`/sensors/${roomId}?period=${period}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching sensor data for room ${roomId}:`, error);
      return [];
    }
  },

  // Получение данных по энергопотреблению
  async getEnergyData(period: string = '24h'): Promise<EnergyData[]> {
    try {
      const response = await api.get<EnergyData[]>(`/energy?period=${period}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching energy data:', error);
      return [];
    }
  }
};

// Методы для симуляции данных (для локальной разработки)
export const mockApiService = {
  // Генерация случайной температуры
  generateTemperatureData(roomId: string, hours: number = 24): SensorData[] {
    const baseTemp = 20 + Math.random() * 5;
    return Array.from({ length: hours }).map((_, i) => {
      const hour = (new Date().getHours() - hours + i + 24) % 24;
      return {
        timestamp: new Date(new Date().setHours(hour, 0, 0, 0)),
        roomId,
        temperature: baseTemp + Math.sin(hour / hours * Math.PI * 2) * 2 + Math.random() * 0.5,
        humidity: 0 // Будет заполнено в другом методе
      };
    });
  },

  // Генерация случайной влажности
  generateHumidityData(roomId: string, hours: number = 24): SensorData[] {
    const baseHumidity = 40 + Math.random() * 20;
    return Array.from({ length: hours }).map((_, i) => {
      const hour = (new Date().getHours() - hours + i + 24) % 24;
      return {
        timestamp: new Date(new Date().setHours(hour, 0, 0, 0)),
        roomId,
        temperature: 0, // Будет заполнено в другом методе
        humidity: Math.min(Math.max(
          baseHumidity + Math.sin(hour / hours * Math.PI * 2) * 10 + Math.random() * 5, 0
        ), 100)
      };
    });
  },

  // Генерация данных энергопотребления
  generateEnergyData(hours: number = 24): EnergyData[] {
    return Array.from({ length: hours }).map((_, i) => {
      const hour = (new Date().getHours() - hours + i + 24) % 24;
      let power;
      
      if (hour >= 8 && hour <= 22) {
        // Дневное потребление с пиком вечером
        power = 800 + 800 * Math.sin((hour - 8) / 14 * Math.PI) + Math.random() * 200;
      } else {
        // Ночное потребление
        power = 300 + Math.random() * 100;
      }
      
      return {
        timestamp: new Date(new Date().setHours(hour, 0, 0, 0)),
        power
      };
    });
  }
};
