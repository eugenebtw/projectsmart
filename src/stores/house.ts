import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Room, SmartDevice, Light, Thermostat, Fan } from '../types';
import { localStorageService } from '../services/local-storage';

export const useHouseStore = defineStore('house', () => {
  // Загрузка данных из localStorage или использование значений по умолчанию
  const savedRooms = localStorageService.loadRooms();
  
  // Состояние
  const rooms = ref<Room[]>(savedRooms || [
    {
      id: 'living-room',
      name: 'Гостиная',
      type: 'living',
      devices: [
        { 
          id: 'light-1', 
          name: 'Основной свет', 
          type: 'light', 
          roomId: 'living-room', 
          isOn: true, 
          power: 60,
          brightness: 80,
          color: '#ffffff'
        } as Light,
        { 
          id: 'fan-1', 
          name: 'Вентилятор', 
          type: 'fan', 
          roomId: 'living-room', 
          isOn: true, 
          power: 45,
          speed: 70
        } as Fan,
        { 
          id: 'thermostat-1', 
          name: 'Термостат', 
          type: 'thermostat', 
          roomId: 'living-room', 
          isOn: true, 
          power: 35,
          temperature: 22.5,
          targetTemperature: 23
        } as Thermostat
      ],
      temperature: 22.5,
      humidity: 45
    },
    {
      id: 'bedroom',
      name: 'Спальня',
      type: 'bedroom',
      devices: [
        { 
          id: 'light-2', 
          name: 'Основной свет', 
          type: 'light', 
          roomId: 'bedroom', 
          isOn: false, 
          power: 40,
          brightness: 60,
          color: '#ffffff'
        } as Light,
        { 
          id: 'thermostat-2', 
          name: 'Термостат', 
          type: 'thermostat', 
          roomId: 'bedroom', 
          isOn: true, 
          power: 30,
          temperature: 20,
          targetTemperature: 20
        } as Thermostat
      ],
      temperature: 20,
      humidity: 50
    },
    {
      id: 'kitchen',
      name: 'Кухня',
      type: 'kitchen',
      devices: [
        { 
          id: 'light-3', 
          name: 'Основной свет', 
          type: 'light', 
          roomId: 'kitchen', 
          isOn: true, 
          power: 70,
          brightness: 100,
          color: '#ffffff'
        } as Light,
        { 
          id: 'socket-1', 
          name: 'Розетка (Холодильник)', 
          type: 'socket', 
          roomId: 'kitchen', 
          isOn: true, 
          power: 150
        } as SmartDevice
      ],
      temperature: 23,
      humidity: 55
    }
  ]);

  // Добавляем состояние для выбранной комнаты
  const selectedRoomId = ref<string | null>(null);

  // Предел энергопотребления
  const powerLimit = 2000; // Ватт

  // Вычисляемые свойства
  const devices = computed(() => {
    const allDevices: SmartDevice[] = [];
    rooms.value.forEach(room => {
      room.devices.forEach(device => {
        allDevices.push(device);
      });
    });
    return allDevices;
  });

  const totalPower = computed(() => {
    return devices.value.reduce((sum, device) => {
      return sum + (device.isOn ? device.power : 0);
    }, 0);
  });

  const isOverloaded = computed(() => {
    return totalPower.value > powerLimit;
  });

  // Метод для выбора комнаты
  const selectRoom = (roomId: string | null) => {
    selectedRoomId.value = roomId;
  };

  // Получить текущую выбранную комнату
  const selectedRoom = computed(() => {
    return getRoomById(selectedRoomId.value);
  });

  // Действия
  // Получить комнату по ID
  const getRoomById = (roomId: string): Room | undefined => {
    return rooms.value.find(room => room.id === roomId);
  };

  // Получить устройство по ID
  const getDeviceById = (deviceId: string): SmartDevice | undefined => {
    for (const room of rooms.value) {
      const device = room.devices.find(d => d.id === deviceId);
      if (device) return device;
    }
    return undefined;
  };

  // Включить/выключить устройство
  const toggleDevice = (deviceId: string) => {
    const device = getDeviceById(deviceId);
    if (device) {
      device.isOn = !device.isOn;
    }
  };
  
  // Добавить новое устройство в комнату
  const addDevice = (deviceData: SmartDevice) => {
    const room = getRoomById(deviceData.roomId);
    if (!room) return;
    
    // Создаем соответствующий тип устройства с нужными свойствами
    let newDevice: SmartDevice;
    
    switch (deviceData.type) {
      case 'light':
        newDevice = {
          ...deviceData,
          type: 'light',
          brightness: 80,
          color: '#ffffff'
        } as Light;
        break;
        
      case 'fan':
        newDevice = {
          ...deviceData,
          type: 'fan',
          speed: 70
        } as Fan;
        break;
        
      case 'thermostat':
        newDevice = {
          ...deviceData,
          type: 'thermostat',
          temperature: room.temperature,
          targetTemperature: room.temperature
        } as Thermostat;
        break;
        
      default:
        newDevice = {
          ...deviceData
        };
    }
    
    // Добавляем устройство в комнату
    room.devices.push(newDevice);
  };
  
  // Удалить устройство
  const removeDevice = (deviceId: string) => {
    for (const room of rooms.value) {
      const deviceIndex = room.devices.findIndex(d => d.id === deviceId);
      if (deviceIndex !== -1) {
        room.devices.splice(deviceIndex, 1);
        break;
      }
    }
  };

  // Обновить яркость света
  const updateLightBrightness = (deviceId: string, brightness: number) => {
    const device = getDeviceById(deviceId) as Light | undefined;
    if (device && device.type === 'light') {
      device.brightness = brightness;
      // Регулируем мощность в зависимости от яркости
      const baseWattage = device.power / (device.brightness / 100);
      device.power = Math.round(baseWattage * (brightness / 100));
    }
  };

  // Обновить температуру термостата
  const updateThermostat = (deviceId: string, targetTemperature: number) => {
    const device = getDeviceById(deviceId) as Thermostat | undefined;
    if (device && device.type === 'thermostat') {
      device.targetTemperature = targetTemperature;
    }
  };

  // Обновить скорость вентилятора
  const updateFanSpeed = (deviceId: string, speed: number) => {
    const device = getDeviceById(deviceId) as Fan | undefined;
    if (device && device.type === 'fan') {
      device.speed = speed;
      // Регулируем мощность в зависимости от скорости
      const baseWattage = device.power / (device.speed / 100);
      device.power = Math.round(baseWattage * (speed / 100));
    }
  };

  // Обновить данные температуры и влажности комнаты
  const updateRoomEnvironment = (roomId: string, temperature: number, humidity: number) => {
    const room = getRoomById(roomId);
    if (room) {
      room.temperature = temperature;
      room.humidity = humidity;
      
      // Также обновляем текущую температуру в термостатах комнаты
      room.devices.forEach(device => {
        if (device.type === 'thermostat') {
          (device as Thermostat).temperature = temperature;
        }
      });
    }
  };
  
  // Добавить новую комнату
  const addRoom = (roomData: Room) => {
    // Проверяем, что ID комнаты уникален
    if (rooms.value.some(room => room.id === roomData.id)) {
      console.error(`Room with ID ${roomData.id} already exists`);
      return;
    }
    
    rooms.value.push(roomData);
  };
  
  // Удалить комнату
  const removeRoom = (roomId: string) => {
    const roomIndex = rooms.value.findIndex(room => room.id === roomId);
    if (roomIndex !== -1) {
      rooms.value.splice(roomIndex, 1);
    }
  };

  // Сохраняем данные в localStorage при изменении
  watch(
    rooms,
    (newRooms) => {
      localStorageService.saveRooms(newRooms);
    },
    { deep: true }
  );

  return {
    rooms,
    devices,
    totalPower,
    isOverloaded,
    powerLimit,
    selectedRoomId,
    selectedRoom,
    selectRoom,
    getRoomById,
    getDeviceById,
    toggleDevice,
    addDevice,
    removeDevice,
    updateLightBrightness,
    updateThermostat,
    updateFanSpeed,
    updateRoomEnvironment,
    addRoom,
    removeRoom
  };
});