<template>
  <div class="controller">
    <h2>Панель управления</h2>
    
    <div class="energy-monitor" :class="{ overload: isEnergyOverload }">
      <h3>Потребление энергии</h3>
      <div class="energy-bar">
        <div class="energy-fill" :style="{ width: `${energyPercentage}%` }"></div>
      </div>
      <p>{{ totalPower }} Вт{{ isEnergyOverload ? ' (ПЕРЕГРУЗКА!)' : '' }}</p>
    </div>
    
    <div class="rooms-tabs">
      <button 
        v-for="room in rooms" 
        :key="room.id"
        :class="{ active: selectedRoomId === room.id }"
        @click="selectRoom(room.id)"
      >
        {{ room.name }}
      </button>
    </div>
    
    <div v-if="selectedRoom" class="room-controls">
      <h3>{{ selectedRoom.name }}</h3>
      
      <div class="ambient-info">
        <div class="info-box">
          <div class="info-label">Температура</div>
          <div class="info-value">{{ selectedRoom.temperature }}°C</div>
        </div>
        <div class="info-box">
          <div class="info-label">Влажность</div>
          <div class="info-value">{{ selectedRoom.humidity }}%</div>
        </div>
      </div>
      
      <div class="devices-list">
        <div 
          v-for="device in selectedRoomDevices" 
          :key="device.id"
          class="device-item"
        >
          <div class="device-header">
            <div class="device-name">{{ device.name }}</div>
            <div class="device-power">{{ device.power }} Вт</div>
            <button 
              class="toggle-button" 
              :class="{ 'on': device.isOn }"
              @click="toggleDevice(device.id)"
            >
              {{ device.isOn ? 'Вкл' : 'Выкл' }}
            </button>
          </div>
          
          <!-- Термостат -->
          <div v-if="device.type === 'thermostat'" class="device-controls">
            <div class="slider-container">
              <span>Температура: {{ (device as Thermostat).targetTemperature }}°C</span>
              <input 
                type="range" 
                min="16" 
                max="30" 
                step="0.5"
                :value="(device as Thermostat).targetTemperature"
                :disabled="!device.isOn"
                @input="updateThermostat(device.id, $event)"
              />
            </div>
          </div>
          
          <!-- Свет -->
          <div v-if="device.type === 'light'" class="device-controls">
            <div class="slider-container">
              <span>Яркость: {{ (device as Light).brightness }}%</span>
              <input 
                type="range" 
                min="1" 
                max="100" 
                :value="(device as Light).brightness"
                :disabled="!device.isOn"
                @input="updateLightBrightness(device.id, $event)"
              />
            </div>
          </div>
          
          <!-- Вентилятор -->
          <div v-if="device.type === 'fan'" class="device-controls">
            <div class="slider-container">
              <span>Скорость: {{ (device as Fan).speed }}%</span>
              <input 
                type="range" 
                min="1" 
                max="100" 
                :value="(device as Fan).speed"
                :disabled="!device.isOn"
                @input="updateFanSpeed(device.id, $event)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useHouseStore } from '../stores/house';
import { Light, Thermostat, Fan } from '../types';

const houseStore = useHouseStore();

const selectedRoomId = ref<string | null>(null);

// Вычисляемые свойства
const rooms = computed(() => houseStore.rooms);
const selectedRoom = computed(() => rooms.value.find(room => room.id === selectedRoomId.value) || null);
const selectedRoomDevices = computed(() => selectedRoom.value ? selectedRoom.value.devices : []);
const totalPower = computed(() => houseStore.totalPower);
const isEnergyOverload = computed(() => houseStore.isOverloaded);
const energyPercentage = computed(() => Math.min((totalPower.value / 2000) * 100, 100));

// При монтировании выбираем первую комнату по умолчанию
if (rooms.value.length > 0) {
  selectedRoomId.value = rooms.value[0].id;
}

// Методы
const selectRoom = (roomId: string) => {
  selectedRoomId.value = roomId;
};

const toggleDevice = (deviceId: string) => {
  houseStore.toggleDevice(deviceId);
};

const updateThermostat = (deviceId: string, event: Event) => {
  const target = event.target as HTMLInputElement;
  const value = parseFloat(target.value);
  houseStore.updateThermostat(deviceId, value);
};

const updateLightBrightness = (deviceId: string, event: Event) => {
  const target = event.target as HTMLInputElement;
  const value = parseInt(target.value, 10);
  houseStore.updateLightBrightness(deviceId, value);
};

const updateFanSpeed = (deviceId: string, event: Event) => {
  const target = event.target as HTMLInputElement;
  const value = parseInt(target.value, 10);
  houseStore.updateFanSpeed(deviceId, value);
};
</script>

<style scoped>
.controller {
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

h2 {
  margin-top: 0;
  color: #333;
}

.energy-monitor {
  background-color: #fff;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
  transition: background-color 0.3s;
}

.energy-monitor.overload {
  background-color: #ffeeee;
  animation: pulse 1s infinite alternate;
}

@keyframes pulse {
  from { background-color: #ffeeee; }
  to { background-color: #ffcccc; }
}

.energy-bar {
  height: 20px;
  background-color: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
  margin: 10px 0;
}

.energy-fill {
  height: 100%;
  background-color: #4caf50;
  transition: width 0.3s, background-color 0.3s;
}

.overload .energy-fill {
  background-color: #f44336;
}

.rooms-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  overflow-x: auto;
  padding-bottom: 5px;
}

.rooms-tabs button {
  padding: 8px 15px;
  background-color: #e0e0e0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.2s;
}

.rooms-tabs button.active {
  background-color: #2196f3;
  color: white;
}

.room-controls {
  background-color: #fff;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.ambient-info {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.info-box {
  flex: 1;
  background-color: #f8f8f8;
  border-radius: 6px;
  padding: 10px;
  text-align: center;
}

.info-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 5px;
}

.info-value {
  font-size: 24px;
  font-weight: bold;
  color: #333;
}

.devices-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.device-item {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
}

.device-header {
  display: flex;
  align-items: center;
  padding: 10px 15px;
  background-color: #f8f8f8;
}

.device-name {
  flex: 1;
  font-weight: bold;
}

.device-power {
  margin-right: 15px;
  color: #666;
}

.toggle-button {
  padding: 5px 10px;
  border: none;
  border-radius: 4px;
  background-color: #f44336;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
}

.toggle-button.on {
  background-color: #4caf50;
}

.device-controls {
  padding: 15px;
  border-top: 1px solid #e0e0e0;
}

.slider-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

input[type="range"] {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  background-color: #e0e0e0;
  border-radius: 3px;
  outline: none;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background-color: #2196f3;
  border-radius: 50%;
  cursor: pointer;
}

input[type="range"]:disabled {
  opacity: 0.5;
}
</style>
