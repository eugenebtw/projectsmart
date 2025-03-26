<template>
  <div class="chart-container">
    <h3>Мониторинг за последние 24 часа</h3>
    <div class="chart-tabs">
      <button 
        :class="{ active: activeChart === 'temperature' }"
        @click="activeChart = 'temperature'"
      >
        Температура
      </button>
      <button 
        :class="{ active: activeChart === 'humidity' }"
        @click="activeChart = 'humidity'"
      >
        Влажность
      </button>
      <button 
        :class="{ active: activeChart === 'power' }"
        @click="activeChart = 'power'"
      >
        Энергопотребление
      </button>
    </div>
    <div class="chart-wrapper">
      <canvas ref="chartCanvas" width="800" height="400"></canvas>
    </div>
    <div class="chart-legend">
      <div v-if="activeChart === 'temperature' || activeChart === 'humidity'">
        <div 
          v-for="(room, index) in rooms" 
          :key="room.id" 
          class="legend-item"
        >
          <span 
            class="legend-color" 
            :style="{ backgroundColor: roomColors[index % roomColors.length] }"
          ></span>
          <span>{{ room.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useHouseStore } from '../stores/house';
import { useSensorsStore } from '../stores/sensors';
import { useEnergyStore } from '../stores/energy';

const houseStore = useHouseStore();
const sensorsStore = useSensorsStore();
const energyStore = useEnergyStore();

const chartCanvas = ref<HTMLCanvasElement | null>(null);
const activeChart = ref<'temperature' | 'humidity' | 'power'>('temperature');

// Цвета для графиков комнат
const roomColors = [
  '#4CAF50', '#2196F3', '#FFC107', '#E91E63', '#9C27B0',
  '#FF5722', '#795548', '#00BCD4', '#3F51B5', '#CDDC39'
];

const rooms = computed(() => houseStore.rooms);

// Отрисовка графика температуры
const drawTemperatureChart = () => {
  const canvas = chartCanvas.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Очистка Canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Настройки графика
  const padding = 50;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;
  const minTemp = 15; // минимальная температура на шкале
  const maxTemp = 35; // максимальная температура на шкале

  // Отрисовка осей
  drawAxes(ctx, padding, canvas.width, canvas.height, 'Часы', '°C');

  // Отрисовка шкалы температуры
  for (let temp = minTemp; temp <= maxTemp; temp += 5) {
    const y = canvas.height - padding - ((temp - minTemp) / (maxTemp - minTemp)) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding - 5, y);
    ctx.lineTo(padding, y);
    ctx.stroke();
    
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${temp}°C`, padding - 10, y + 4);
  }

  // Отрисовка временной шкалы
  const hours = Array.from({ length: 24 }, (_, i) => (new Date().getHours() - 23 + i + 24) % 24);
  hours.forEach((hour, index) => {
    const x = padding + (index / 23) * chartWidth;
    ctx.beginPath();
    ctx.moveTo(x, canvas.height - padding);
    ctx.lineTo(x, canvas.height - padding + 5);
    ctx.stroke();
    
    if (index % 3 === 0) { // Отображаем каждый третий час для читаемости
      ctx.fillStyle = '#666';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${hour}:00`, x, canvas.height - padding + 20);
    }
  });

  // Получаем данные температуры для каждой комнаты
  rooms.value.forEach((room, roomIndex) => {
    const temperatureData = sensorsStore.getTemperatureData(room.id);
    if (!temperatureData || temperatureData.length === 0) return;

    ctx.beginPath();
    ctx.strokeStyle = roomColors[roomIndex % roomColors.length];
    ctx.lineWidth = 2;

    temperatureData.forEach((data, index) => {
      const x = padding + (index / (temperatureData.length - 1)) * chartWidth;
      const y = canvas.height - padding - ((data.value - minTemp) / (maxTemp - minTemp)) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  });
};

// Отрисовка графика влажности
const drawHumidityChart = () => {
  const canvas = chartCanvas.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Очистка Canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Настройки графика
  const padding = 50;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;
  const minHumidity = 0;
  const maxHumidity = 100;

  // Отрисовка осей
  drawAxes(ctx, padding, canvas.width, canvas.height, 'Часы', '%');

  // Отрисовка шкалы влажности
  for (let humidity = 0; humidity <= 100; humidity += 20) {
    const y = canvas.height - padding - (humidity / 100) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding - 5, y);
    ctx.lineTo(padding, y);
    ctx.stroke();
    
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${humidity}%`, padding - 10, y + 4);
  }

  // Отрисовка временной шкалы
  const hours = Array.from({ length: 24 }, (_, i) => (new Date().getHours() - 23 + i + 24) % 24);
  hours.forEach((hour, index) => {
    const x = padding + (index / 23) * chartWidth;
    ctx.beginPath();
    ctx.moveTo(x, canvas.height - padding);
    ctx.lineTo(x, canvas.height - padding + 5);
    ctx.stroke();
    
    if (index % 3 === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${hour}:00`, x, canvas.height - padding + 20);
    }
  });

  // Получаем данные влажности для каждой комнаты
  rooms.value.forEach((room, roomIndex) => {
    const humidityData = sensorsStore.getHumidityData(room.id);
    if (!humidityData || humidityData.length === 0) return;

    ctx.beginPath();
    ctx.strokeStyle = roomColors[roomIndex % roomColors.length];
    ctx.lineWidth = 2;

    humidityData.forEach((data, index) => {
      const x = padding + (index / (humidityData.length - 1)) * chartWidth;
      const y = canvas.height - padding - ((data.value - minHumidity) / (maxHumidity - minHumidity)) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  });
};

// Отрисовка графика энергопотребления
const drawPowerChart = () => {
  const canvas = chartCanvas.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Очистка Canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Настройки графика
  const padding = 50;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;
  const maxPower = 2500; // максимальная мощность на шкале (Вт)

  // Отрисовка осей
  drawAxes(ctx, padding, canvas.width, canvas.height, 'Часы', 'Вт');

  // Отрисовка шкалы мощности
  for (let power = 0; power <= maxPower; power += 500) {
    const y = canvas.height - padding - (power / maxPower) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding - 5, y);
    ctx.lineTo(padding, y);
    ctx.stroke();
    
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${power} Вт`, padding - 10, y + 4);
  }

  // Отрисовка временной шкалы
  const hours = Array.from({ length: 24 }, (_, i) => (new Date().getHours() - 23 + i + 24) % 24);
  hours.forEach((hour, index) => {
    const x = padding + (index / 23) * chartWidth;
    ctx.beginPath();
    ctx.moveTo(x, canvas.height - padding);
    ctx.lineTo(x, canvas.height - padding + 5);
    ctx.stroke();
    
    if (index % 3 === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${hour}:00`, x, canvas.height - padding + 20);
    }
  });

  // Получаем данные энергопотребления
  const powerData = energyStore.getPowerData();
  if (!powerData || powerData.length === 0) return;

  // Отрисовка линии предельной мощности
  const overloadY = canvas.height - padding - (2000 / maxPower) * chartHeight;
  ctx.beginPath();
  ctx.strokeStyle = '#FF0000';
  ctx.setLineDash([5, 5]);
  ctx.moveTo(padding, overloadY);
  ctx.lineTo(canvas.width - padding, overloadY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  ctx.fillStyle = '#FF0000';
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Предел (2000 Вт)', padding + 10, overloadY - 5);

  // Отрисовка графика энергопотребления
  ctx.beginPath();
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 2;

  powerData.forEach((data, index) => {
    const x = padding + (index / (powerData.length - 1)) * chartWidth;
    const y = canvas.height - padding - (data.value / maxPower) * chartHeight;
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  
  ctx.stroke();

  // Заливка области под графиком
  ctx.lineTo(padding + chartWidth, canvas.height - padding);
  ctx.lineTo(padding, canvas.height - padding);
  ctx.closePath();
  ctx.fillStyle = 'rgba(33, 150, 243, 0.2)';
  ctx.fill();
};

// Отрисовка осей
const drawAxes = (
  ctx: CanvasRenderingContext2D, 
  padding: number, 
  width: number, 
  height: number,
  xLabel: string,
  yLabel: string
) => {
  ctx.beginPath();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  
  // Ось Y
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  
  // Ось X
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();
  
  // Подписи осей
  ctx.fillStyle = '#333';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(xLabel, width / 2, height - 10);
  
  ctx.save();
  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
};

// Выбор графика для отрисовки
const drawChart = () => {
  switch (activeChart.value) {
    case 'temperature':
      drawTemperatureChart();
      break;
    case 'humidity':
      drawHumidityChart();
      break;
    case 'power':
      drawPowerChart();
      break;
  }
};

// Инициализация и следим за изменениями
onMounted(() => {
  drawChart();
  
  // Генерируем случайные данные для демонстрации
  // В реальном приложении данные должны приходить извне
  if (sensorsStore.getAllTemperatureData.length === 0) {
    // Для каждой комнаты генерируем данные на 24 часа
    rooms.value.forEach(room => {
      // Генерируем температуру
      const baseTemp = 20 + Math.random() * 5;
      Array.from({ length: 24 }).forEach((_, i) => {
        const hour = (new Date().getHours() - 23 + i + 24) % 24;
        const temp = baseTemp + Math.sin(hour / 24 * Math.PI * 2) * 2 + Math.random() * 0.5;
        sensorsStore.addTemperatureData(room.id, {
          timestamp: new Date(new Date().setHours(hour, 0, 0, 0)),
          value: temp
        });
      });
      
      // Генерируем влажность
      const baseHumidity = 40 + Math.random() * 20;
      Array.from({ length: 24 }).forEach((_, i) => {
        const hour = (new Date().getHours() - 23 + i + 24) % 24;
        const humidity = baseHumidity + Math.sin(hour / 24 * Math.PI * 2) * 10 + Math.random() * 5;
        sensorsStore.addHumidityData(room.id, {
          timestamp: new Date(new Date().setHours(hour, 0, 0, 0)),
          value: Math.min(Math.max(humidity, 0), 100) // Ограничиваем от 0 до 100
        });
      });
    });
    
    // Генерируем данные энергопотребления
    Array.from({ length: 24 }).forEach((_, i) => {
      const hour = (new Date().getHours() - 23 + i + 24) % 24;
      // Больше энергопотребление вечером, меньше ночью
      let power;
      if (hour >= 8 && hour <= 22) {
        // Дневное потребление с пиком вечером
        power = 800 + 800 * Math.sin((hour - 8) / 14 * Math.PI) + Math.random() * 200;
      } else {
        // Ночное потребление
        power = 300 + Math.random() * 100;
      }
      
      energyStore.addPowerData({
        timestamp: new Date(new Date().setHours(hour, 0, 0, 0)),
        value: power
      });
    });
  }
});

// Отслеживаем изменение активного графика
watch(activeChart, () => {
  drawChart();
});

// Отслеживаем изменение данных
watch([
  () => sensorsStore.getAllTemperatureData,
  () => sensorsStore.getAllHumidityData,
  () => energyStore.getPowerData()
], () => {
  drawChart();
}, { deep: true });
</script>

<style scoped>
.chart-container {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

h3 {
  margin-top: 0;
  color: #333;
  margin-bottom: 20px;
}

.chart-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.chart-tabs button {
  padding: 8px 15px;
  background-color: #e0e0e0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.chart-tabs button.active {
  background-color: #2196f3;
  color: white;
}

.chart-wrapper {
  width: 100%;
  height: 400px;
  margin-bottom: 20px;
}

canvas {
  width: 100%;
  height: 100%;
}

.chart-legend {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 15px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.legend-color {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
</style>
