<template>
    <div class="sensor-chart">
      <h3>Показания датчиков</h3>
      <div class="room-selector">
        <label for="room-select">Выберите комнату:</label>
        <select id="room-select" v-model="selectedRoomId">
          <option v-for="room in rooms" :key="room.id" :value="room.id">
            {{ room.name }}
          </option>
        </select>
      </div>
  
      <div class="charts-container">
        <div class="chart-box">
          <h4>Температура</h4>
          <canvas ref="temperatureCanvas" width="400" height="200"></canvas>
          <div class="current-value">
            <span class="value">{{ currentTemperature }}°C</span>
            <div class="value-indicator" :style="{ height: `${getTemperatureHeight()}px` }"></div>
          </div>
        </div>
  
        <div class="chart-box">
          <h4>Влажность</h4>
          <canvas ref="humidityCanvas" width="400" height="200"></canvas>
          <div class="current-value">
            <span class="value">{{ currentHumidity }}%</span>
            <div class="value-indicator humidity" :style="{ height: `${getHumidityHeight()}px` }"></div>
          </div>
        </div>
      </div>
  
      <div class="time-range">
        <button 
          v-for="range in timeRanges" 
          :key="range.value" 
          :class="{ active: selectedRange === range.value }"
          @click="selectRange(range.value)"
        >
          {{ range.label }}
        </button>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, onMounted, computed, watch } from 'vue';
  import { useHouseStore } from '../stores/house';
  import { useSensorsStore } from '../stores/sensors';
  
  const houseStore = useHouseStore();
  const sensorsStore = useSensorsStore();
  
  // Референсы для канвасов
  const temperatureCanvas = ref<HTMLCanvasElement | null>(null);
  const humidityCanvas = ref<HTMLCanvasElement | null>(null);
  
  // Состояние компонента
  const selectedRoomId = ref<string>('');
  const selectedRange = ref<string>('24h');
  
  // Варианты временных диапазонов
  const timeRanges = [
    { label: '24 ч', value: '24h' },
    { label: '12 ч', value: '12h' },
    { label: '6 ч', value: '6h' },
    { label: '1 ч', value: '1h' }
  ];
  
  // Вычисляемые свойства
  const rooms = computed(() => houseStore.rooms);
  const selectedRoom = computed(() => rooms.value.find(room => room.id === selectedRoomId.value));
  const currentTemperature = computed(() => {
    return selectedRoom.value ? selectedRoom.value.temperature.toFixed(1) : 'N/A';
  });
  const currentHumidity = computed(() => {
    return selectedRoom.value ? selectedRoom.value.humidity.toFixed(0) : 'N/A';
  });
  
  // Методы для анимации индикаторов значений
  const getTemperatureHeight = () => {
    if (!selectedRoom.value) return 0;
    // Показываем высоту в зависимости от температуры (от 15°C до 35°C)
    const temp = selectedRoom.value.temperature;
    const percentage = Math.max(0, Math.min(100, ((temp - 15) / 20) * 100));
    return percentage;
  };
  
  const getHumidityHeight = () => {
    if (!selectedRoom.value) return 0;
    // Показываем высоту в зависимости от влажности (от 0% до 100%)
    return selectedRoom.value.humidity;
  };
  
  // Выбор временного диапазона
  const selectRange = (range: string) => {
    selectedRange.value = range;
    drawCharts();
  };
  
  // Отрисовка графика температуры
  const drawTemperatureChart = () => {
    const canvas = temperatureCanvas.value;
    if (!canvas || !selectedRoomId.value) return;
  
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
  
    // Очистка канваса
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    // Получаем данные
    const temperatureData = sensorsStore.getTemperatureData(selectedRoomId.value);
    
    if (!temperatureData || temperatureData.length === 0) {
      drawEmptyChart(ctx, canvas.width, canvas.height, 'Нет данных о температуре');
      return;
    }
  
    // Определяем количество точек для отображения в зависимости от выбранного диапазона
    let pointsToShow = temperatureData.length;
    if (selectedRange.value === '12h') pointsToShow = Math.min(12, temperatureData.length);
    if (selectedRange.value === '6h') pointsToShow = Math.min(6, temperatureData.length);
    if (selectedRange.value === '1h') pointsToShow = Math.min(1, temperatureData.length);
  
    const filteredData = temperatureData.slice(-pointsToShow);
  
    // Настройки графика
    const padding = 30;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    
    // Находим минимальное и максимальное значения
    const minTemp = Math.floor(Math.min(...filteredData.map(d => d.value)) - 1);
    const maxTemp = Math.ceil(Math.max(...filteredData.map(d => d.value)) + 1);
    
    // Отрисовка осей
    drawAxes(ctx, padding, canvas.width, canvas.height);
    
    // Отрисовка линии графика
    ctx.beginPath();
    ctx.strokeStyle = '#e91e63';
    ctx.lineWidth = 2;
    
    filteredData.forEach((data, index) => {
      const x = padding + (index / (filteredData.length - 1 || 1)) * chartWidth;
      const y = canvas.height - padding - ((data.value - minTemp) / (maxTemp - minTemp || 1)) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Заливка под линией
    ctx.lineTo(padding + chartWidth, canvas.height - padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.closePath();
    ctx.fillStyle = 'rgba(233, 30, 99, 0.1)';
    ctx.fill();
    
    // Подписи значений
    ctx.font = '10px Arial';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    
    filteredData.forEach((data, index) => {
      const x = padding + (index / (filteredData.length - 1 || 1)) * chartWidth;
      const y = canvas.height - padding - ((data.value - minTemp) / (maxTemp - minTemp || 1)) * chartHeight;
      
      // Отображаем только несколько точек для предотвращения перекрытия
      if (index % Math.max(1, Math.floor(filteredData.length / 5)) === 0) {
        ctx.fillText(`${data.value.toFixed(1)}°C`, x, y - 10);
      }
    });
  };
  
  // Отрисовка графика влажности
  const drawHumidityChart = () => {
    const canvas = humidityCanvas.value;
    if (!canvas || !selectedRoomId.value) return;
  
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
  
    // Очистка канваса
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    // Получаем данные
    const humidityData = sensorsStore.getHumidityData(selectedRoomId.value);
    
    if (!humidityData || humidityData.length === 0) {
      drawEmptyChart(ctx, canvas.width, canvas.height, 'Нет данных о влажности');
      return;
    }
  
    // Определяем количество точек для отображения в зависимости от выбранного диапазона
    let pointsToShow = humidityData.length;
    if (selectedRange.value === '12h') pointsToShow = Math.min(12, humidityData.length);
    if (selectedRange.value === '6h') pointsToShow = Math.min(6, humidityData.length);
    if (selectedRange.value === '1h') pointsToShow = Math.min(1, humidityData.length);
  
    const filteredData = humidityData.slice(-pointsToShow);
  
    // Настройки графика
    const padding = 30;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    
    // Находим минимальное и максимальное значения
    const minHumidity = Math.max(0, Math.floor(Math.min(...filteredData.map(d => d.value)) - 5));
    const maxHumidity = Math.min(100, Math.ceil(Math.max(...filteredData.map(d => d.value)) + 5));
    
    // Отрисовка осей
    drawAxes(ctx, padding, canvas.width, canvas.height);
    
    // Отрисовка линии графика
    ctx.beginPath();
    ctx.strokeStyle = '#2196f3';
    ctx.lineWidth = 2;
    
    filteredData.forEach((data, index) => {
      const x = padding + (index / (filteredData.length - 1 || 1)) * chartWidth;
      const y = canvas.height - padding - ((data.value - minHumidity) / (maxHumidity - minHumidity || 1)) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Заливка под линией
    ctx.lineTo(padding + chartWidth, canvas.height - padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.closePath();
    ctx.fillStyle = 'rgba(33, 150, 243, 0.1)';
    ctx.fill();
    
    // Подписи значений
    ctx.font = '10px Arial';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    
    filteredData.forEach((data, index) => {
      const x = padding + (index / (filteredData.length - 1 || 1)) * chartWidth;
      const y = canvas.height - padding - ((data.value - minHumidity) / (maxHumidity - minHumidity || 1)) * chartHeight;
      
      // Отображаем только несколько точек для предотвращения перекрытия
      if (index % Math.max(1, Math.floor(filteredData.length / 5)) === 0) {
        ctx.fillText(`${data.value.toFixed(0)}%`, x, y - 10);
      }
    });
  };
  
  // Отрисовка осей
  const drawAxes = (ctx: CanvasRenderingContext2D, padding: number, width: number, height: number) => {
    ctx.beginPath();
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    
    // Горизонтальные линии сетки
    for (let i = 0; i <= 4; i++) {
      const y = padding + (i / 4) * (height - padding * 2);
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
    }
    
    // Вертикальные линии сетки
    for (let i = 0; i <= 4; i++) {
      const x = padding + (i / 4) * (width - padding * 2);
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
    }
    
    ctx.stroke();
  };
  
  // Отрисовка пустого графика
  const drawEmptyChart = (ctx: CanvasRenderingContext2D, width: number, height: number, message: string) => {
    ctx.fillStyle = '#888';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, width / 2, height / 2);
  };
  
  // Отрисовка обоих графиков
  const drawCharts = () => {
    drawTemperatureChart();
    drawHumidityChart();
  };
  
  // Инициализация и обработчики
  onMounted(() => {
    // Выбираем первую комнату по умолчанию
    if (rooms.value && rooms.value.length > 0) {
      selectedRoomId.value = rooms.value[0].id;
    }
    
    // Начальная отрисовка графиков
    drawCharts();
    
    // Генерируем случайные данные для демонстрации
    const temperatureData = sensorsStore.getAllTemperatureData;
    if (!temperatureData || temperatureData.length === 0) {
      rooms.value.forEach(room => {
        // Генерируем температуру
        const baseTemp = 20 + Math.random() * 5;
        for (let i = 0; i < 24; i++) {
          const hour = (new Date().getHours() - 23 + i + 24) % 24;
          const temp = baseTemp + Math.sin(hour / 24 * Math.PI * 2) * 2 + Math.random() * 0.5;
          sensorsStore.addTemperatureData(room.id, {
            timestamp: new Date(new Date().setHours(hour, 0, 0, 0)),
            value: temp
          });
        }
        
        // Генерируем влажность
        const baseHumidity = 40 + Math.random() * 20;
        for (let i = 0; i < 24; i++) {
          const hour = (new Date().getHours() - 23 + i + 24) % 24;
          const humidity = baseHumidity + Math.sin(hour / 24 * Math.PI * 2) * 10 + Math.random() * 5;
          sensorsStore.addHumidityData(room.id, {
            timestamp: new Date(new Date().setHours(hour, 0, 0, 0)),
            value: Math.min(Math.max(humidity, 0), 100)
          });
        }
      });
    }
  });
  
  // Следим за изменениями выбранной комнаты и данных
  watch([selectedRoomId, selectedRange], () => {
    drawCharts();
  });
  
  // Следим за изменениями данных о температуре и влажности
  watch(
    [
      () => sensorsStore.getAllTemperatureData,
      () => sensorsStore.getAllHumidityData
    ],
    () => {
      drawCharts();
    },
    { deep: true }
  );
  </script>
  
  <style scoped>
  .sensor-chart {
    padding: 20px;
    background: var(--card-bg);
    border-radius: 8px;
    box-shadow: var(--card-shadow);
  }
  
  h3 {
    margin-top: 0;
    color: var(--text-color);
    margin-bottom: 20px;
  }
  
  .room-selector {
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  
  select {
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    background-color: var(--bg-color);
    color: var(--text-color);
    font-size: 14px;
  }
  
  .charts-container {
    display: flex;
    flex-direction: column;
    gap: 30px;
    margin-bottom: 20px;
  }
  
  @media (min-width: 768px) {
    .charts-container {
      flex-direction: row;
    }
    
    .chart-box {
      flex: 1;
    }
  }
  
  .chart-box {
    position: relative;
    background-color: var(--bg-color);
    border-radius: 8px;
    padding: 15px;
  }
  
  h4 {
    margin-top: 0;
    margin-bottom: 15px;
    color: var(--text-color);
  }
  
  canvas {
    width: 100%;
    height: 200px;
    display: block;
  }
  
  .current-value {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 15px;
    height: 30px;
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 15px;
    overflow: hidden;
  }
  
  .value {
    position: relative;
    z-index: 2;
    padding: 0 15px;
    font-weight: bold;
    color: var(--text-color);
  }
  
  .value-indicator {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    background-color: rgba(233, 30, 99, 0.2);
    transition: height 0.5s ease-out;
  }
  
  .value-indicator.humidity {
    background-color: rgba(33, 150, 243, 0.2);
  }
  
  .time-range {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 20px;
  }
  
  .time-range button {
    padding: 6px 12px;
    border: 1px solid var(--border-color);
    background-color: var(--bg-color);
    color: var(--text-color);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .time-range button.active {
    background-color: var(--accent-color);
    color: white;
    border-color: var(--accent-color);
  }
  </style>
  