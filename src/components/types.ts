export interface SmartDevice {
    id: string;
    type: 'light' | 'thermostat' | 'socket';
    power: number; // Потребляемая мощность в ваттах
    isOn?: boolean; // Состояние устройства (вкл/выкл)
    temperature?: number; // Температура для термостата
  }
  
  export interface Room {
    id: string;
    name: string;
    devices: SmartDevice[];
  }