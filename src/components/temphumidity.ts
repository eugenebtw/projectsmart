import { ref, onMounted } from 'vue';

// Генерация случайных данных за 24 часа
export const generateData = () => {
  const data = [];
  for (let i = 0; i < 24; i++) {
    data.push({
      hour: i,
      temperature: Math.floor(Math.random() * (30 - 15 + 1)) + 15, // Температура от 15°C до 30°C
      humidity: Math.floor(Math.random() * (100 - 40 + 1)) + 40,   // Влажность от 40% до 100%
    });
  }
  return data;
};

const chartData = ref(generateData());