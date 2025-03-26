export type DeviceType = 'light' | 'thermostat' | 'fan' | 'socket';

export type RoomType = 'living' | 'bedroom' | 'kitchen' | 'bathroom';

export interface SmartDevice {
  id: string;
  name: string;
  type: DeviceType;
  roomId: string;
  isOn: boolean;
  power: number; // потребляемая мощность, Вт
}

export interface Light extends SmartDevice {
  type: 'light';
  brightness: number; // 0-100%
  color: string; // hex color
}

export interface Thermostat extends SmartDevice {
  type: 'thermostat';
  temperature: number; // текущая температура, °C
  targetTemperature: number; // заданная температура, °C
}

export interface Fan extends SmartDevice {
  type: 'fan';
  speed: number; // 0-100%
}

export interface Socket extends SmartDevice {
  type: 'socket';
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  devices: SmartDevice[];
  temperature: number; // текущая температура в комнате, °C
  humidity: number; // текущая влажность в комнате, %
}

export interface House {
  rooms: Room[];
  totalPower: number; // общее потребление энергии, Вт
}

export interface SensorData {
  timestamp: Date;
  temperature: number;
  humidity: number;
  roomId: string;
}

export interface EnergyData {
  timestamp: Date;
  power: number; // Вт
}
