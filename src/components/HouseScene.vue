<template>
  <div class="scene-container" ref="sceneContainer">
    <div v-if="isLoading" class="scene-loading">
      <div class="spinner"></div>
      <p>Загрузка 3D модели дома...</p>
    </div>
    
    <div v-if="error" class="scene-error">
      <p>{{ error }}</p>
      <button @click="initScene">Попробовать снова</button>
    </div>
    
    <div v-show="!isLoading && !error" class="controls-hint" :class="{ visible: showControlsHint }">
      <p>Используйте мышь для вращения камеры, колесико для масштабирования</p>
    </div>

    <div v-if="!isLoading && !error" class="scene-stats">
      <div class="stat-item">
        <span class="stat-label">FPS:</span>
        <span class="stat-value">{{ fpsValue }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Объекты:</span>
        <span class="stat-value">{{ objectsCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, onBeforeUnmount, computed, nextTick, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import Stats from 'three/examples/jsm/libs/stats.module';
import { useHouseStore } from '../stores/house';
import { useNotificationStore, NotificationType } from '../stores/notification';
import * as TWEEN from '@tweenjs/tween.js';

const FURNITURE_SCALE = 1.2;       
const USE_BRIGHT_COLORS = true;    

// DEBUG Объект для отладки c TypeScript объявлениями
const DEBUG = {
  enabled: true, // Включить/выключить отладку
  showHelpers: true, // Показывать визуальные помощники
  logCreation: true, // Логировать создание мебели
  
  // Создать визуальный маркер в заданной позиции
  createMarker: (position: THREE.Vector3, color: number = 0xff0000, size: number = 0.2): THREE.Mesh | null => {
    if (!DEBUG.showHelpers) return null;
    
    const markerGeometry = new THREE.SphereGeometry(size);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: color });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(position);
    return marker;
  },
  
  // Логировать информацию о созданной мебели
  logFurniture: (message: string, object?: THREE.Object3D | null): void => {
    if (!DEBUG.logCreation) return;
    
    console.log(`%c${message}`, 'background: #222; color: #bada55');
    if (object) {
      console.log('Position:', object.position);
      console.log('Is visible in scene?', object.visible);
      console.log('Object:', object);
    }
  }
};

// Функция для отладки позиций объектов
const debugObjectPosition = (object: THREE.Object3D, name: string) => {
  console.log(`%c${name} position:`, 'color: #ff00ff', 
    `x=${object.position.x.toFixed(2)}, y=${object.position.y.toFixed(2)}, z=${object.position.z.toFixed(2)}`);
};

// Функция для создания отладочных боксов вокруг объектов
const addDebugBoundingBox = (object: THREE.Object3D, color: number = 0xff00ff) => {
  if (!DEBUG.showHelpers) return;
  
  // Создаем Box3 для вычисления размеров
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  
  // Создаем wireframe куб, соответствующий размерам объекта
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const material = new THREE.MeshBasicMaterial({
    color: color,
    wireframe: true,
    transparent: true,
    opacity: 0.8
  });
  
  const wireframeCube = new THREE.Mesh(geometry, material);
  wireframeCube.position.copy(center);
  
  // Добавляем wireframe куб к родителю объекта
  if (object.parent) {
    object.parent.add(wireframeCube);
    console.log(`Added debug bounding box for ${object.name || 'unnamed object'}`);
  }
};

// Проверка материала с поддержкой TypeScript
const verifyMaterial = (
  materialInput: THREE.Material | undefined | null,
  fallbackName: string = 'wall'
): THREE.Material => {
  if (materialInput) {
    // Если материал уже является объектом Material, просто вернем его
    return materialInput;
  } 
  
  // Если материал не найден, используем запасной вариант
  const fallbackMaterial = materials[fallbackName as keyof typeof materials];
  if (fallbackMaterial) {
    console.warn(`Using fallback material: ${fallbackName}`);
    return fallbackMaterial;
  }
  
  // Если даже запасной вариант не найден, создаем новый розовый материал
  console.warn(`Fallback material '${fallbackName}' not found. Using default pink material.`);
  return new THREE.MeshStandardMaterial({ color: 0xff00ff });
};

// Stores
const houseStore = useHouseStore();
const notificationStore = useNotificationStore();

// Refs
const sceneContainer = ref<HTMLElement | null>(null);
const isLoading = ref(true);
const error = ref<string | null>(null);
const showControlsHint = ref(false);
const fpsValue = ref('0');
const objectsCount = ref(0);
// Цвета для разных типов комнат
const roomColors = {
  living: 0xe8f5e9,   // светло-зеленый для гостиной
  bedroom: 0xe1f5fe,  // светло-голубой для спальни
  kitchen: 0xfff3e0,  // светло-оранжевый для кухни
  bathroom: 0xe0f7fa, // светло-бирюзовый для ванной
  default: 0xf5f5f5   // по умолчанию белый
};

// Three.js variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let raycaster: THREE.Raycaster;
let mouse: THREE.Vector2;
let stats: Stats;

// Room meshes and interactive objects collections
const roomMeshes = new Map<string, THREE.Group>();
const roomWalls = new Map<string, THREE.Mesh[]>();
const roomFloors = new Map<string, THREE.Mesh>();
const roomLights = new Map<string, THREE.Light>();
const roomFans = new Map<string, THREE.Group>();
const roomDevices = new Map<string, THREE.Object3D>();

// Animation
let animationFrameId: number | null = null;
let hintTimerId: number | null = null;
let resizeObserver: ResizeObserver | null = null;

// Materials
const materials = {
  // Полы
  floor: new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.9, metalness: 0.1 }),
  // Крыша
  roof: new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.7, metalness: 0.3 }),
  // Рамы окон и дверей
  frame: new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.5, metalness: 0.5 }),
  // Стекло - УЛУЧШЕНО ДЛЯ ПРОЗРАЧНОСТИ
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.05, // Более гладкое
    metalness: 0.1, // Немного отражения
    transparent: true,
    opacity: 0.5, // Чуть менее прозрачное, чтобы было видно
    transmission: 1.0, // Полное пропускание света
    ior: 1.5, // Индекс преломления стекла
    thickness: 0.02, // Небольшая толщина для рефракции
  }),
  // Для внешней территории
  ground: new THREE.MeshStandardMaterial({ color: 0x7cb342, roughness: 1, metalness: 0 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.8, metalness: 0.2 }),
  wallSelected: new THREE.MeshStandardMaterial({
    color: 0xb3e5fc, // Светло-голубой для выделения
    roughness: 0.8,
    metalness: 0.2,
    polygonOffset: true,        // Включаем смещение полигонов
    polygonOffsetFactor: -1.0,  // Слегка сдвигаем к камере (отрицательное значение)
    polygonOffsetUnits: -4.0    // Дополнительное смещение (можно подбирать)
  }),
  // Материалы для пола
  floorWood: new THREE.MeshStandardMaterial({ color: 0xCD9575, roughness: 0.9, metalness: 0.1 }),
  floorTile: new THREE.MeshStandardMaterial({ color: 0xE5E4E2, roughness: 0.8, metalness: 0.2 }),
  floorCarpet: new THREE.MeshStandardMaterial({ color: 0xB6B6B4, roughness: 0.95, metalness: 0.05 }),
  parquetFloor: new THREE.MeshStandardMaterial({ color: 0xA0522D, roughness: 0.6, metalness: 0.2 }),
  carpetBeige: new THREE.MeshStandardMaterial({ color: 0xE8D4AD, roughness: 0.95, metalness: 0.05 }),
  carpetBlue: new THREE.MeshStandardMaterial({ color: 0x6F8FAF, roughness: 0.95, metalness: 0.05 }),
  // Материалы для мебели - Натуральные цвета
  sofa: new THREE.MeshStandardMaterial({ color: 0x6082B6, roughness: 0.8, metalness: 0.3 }), // Приглушенный синий
  wood: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7, metalness: 0.2 }),
  metallic: new THREE.MeshStandardMaterial({ color: 0xC0C0C0, roughness: 0.3, metalness: 0.8 }),
  leatherSofa: new THREE.MeshStandardMaterial({ color: 0x704214, roughness: 0.7, metalness: 0.4 }), // Коричневая кожа
  fabricSofa: new THREE.MeshStandardMaterial({ color: 0x3E688C, roughness: 0.9, metalness: 0.1 }), // Темно-синяя ткань
  fabricCream: new THREE.MeshStandardMaterial({ color: 0xF5F5DC, roughness: 0.9, metalness: 0.1 }), // Кремовая ткань
  whiteWood: new THREE.MeshStandardMaterial({ color: 0xF5F5F5, roughness: 0.7, metalness: 0.1 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x3D2817, roughness: 0.7, metalness: 0.2 }),
  metalChrome: new THREE.MeshStandardMaterial({ color: 0xC0C0C0, roughness: 0.1, metalness: 0.9 }),
  metalGold: new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.2, metalness: 0.8 }), // Золотистый металл
  blackMetal: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.8 }),
  tv: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x111111, emissiveIntensity: 0.5 }), // Экран чуть светится
  curtain: new THREE.MeshStandardMaterial({ color: 0xDCDCDC, roughness: 0.9, metalness: 0 }),
  bedSheet: new THREE.MeshStandardMaterial({ color: 0xF0F0FF, roughness: 0.8, metalness: 0.1 }), // Почти белое белье
  kitchenTile: new THREE.MeshStandardMaterial({ color: 0xD7CCC8, roughness: 0.5, metalness: 0.3 }),
  countertopMarble: new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.2, metalness: 0.1 }), // Белый мрамор
  sinkMetal: new THREE.MeshStandardMaterial({ color: 0xAAAAAA, roughness: 0.2, metalness: 0.9 }), // Нержавейка
};

// Computed properties
const rooms = computed(() => houseStore.rooms);

// Функция для настройки кнопок просмотра комнат
const setupViewButtons = () => {
  if (!sceneContainer.value) return;
  
  // Добавляем контейнер для кнопок просмотра
  const viewButtonsContainer = document.createElement('div');
  viewButtonsContainer.className = 'view-buttons';
  viewButtonsContainer.style.cssText = `
    position: absolute;
    top: 10px;
    left: 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    z-index: 100;
  `;
  
  sceneContainer.value.appendChild(viewButtonsContainer);
  
  // Предустановленные позиции камеры
  const cameraPositions = {
    'Вид сверху': { position: new THREE.Vector3(0, 20, 0), target: new THREE.Vector3(0, 1.5, 0) },
    'Гостиная': { position: new THREE.Vector3(0, 3.2, 0), target: new THREE.Vector3(0, 2.5, -2) },
    'Спальня': { position: new THREE.Vector3(6, 3.2, 0), target: new THREE.Vector3(6, 2.5, -2) },
    'Кухня': { position: new THREE.Vector3(-6, 3.2, 0), target: new THREE.Vector3(-6, 2.5, -2) }
  };
  
  // Создаем кнопки для каждой позиции
  Object.entries(cameraPositions).forEach(([name, pos]) => {
    const button = document.createElement('button');
    button.innerText = name;
    button.style.cssText = `
      background-color: rgba(0, 0, 0, 0.6);
      color: white;
      border: none;
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    
    button.addEventListener('click', () => {
      // Плавное перемещение камеры к новой позиции
      new TWEEN.Tween(camera.position)
        .to({
          x: pos.position.x,
          y: pos.position.y,
          z: pos.position.z
        }, 1000)
        .easing(TWEEN.Easing.Cubic.InOut)
        .start();
      
      // Плавное перемещение точки фокуса
      new TWEEN.Tween(controls.target)
        .to({
          x: pos.target.x,
          y: pos.target.y,
          z: pos.target.z
        }, 1000)
        .easing(TWEEN.Easing.Cubic.InOut)
        .start();
    });
    
    viewButtonsContainer.appendChild(button);
  });
  
  // Добавляем кнопку для отображения/скрытия крыши
  const toggleRoofButton = document.createElement('button');
  toggleRoofButton.innerText = 'Показать/скрыть крышу';
  toggleRoofButton.style.cssText = `
    background-color: rgba(0, 0, 0, 0.6);
    color: white;
    border: none;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    margin-top: 10px;
  `;
  
  toggleRoofButton.addEventListener('click', () => {
    // Находим объекты крыши и переключаем их видимость
    scene.traverse((object) => {
      if (object.userData && object.userData.type === 'roof') {
        object.visible = !object.visible;
      }
    });
  });
  
  viewButtonsContainer.appendChild(toggleRoofButton);
};

// Initialize the 3D scene
const initScene = async () => {
  isLoading.value = true;
  error.value = null;
  
  try {
    // Wait for DOM to be ready
    await nextTick();
    
    if (!sceneContainer.value) {
      throw new Error('Scene container not found');
    }
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeceff1); // Светло-серый фон
    
    // Create camera
    const width = sceneContainer.value.clientWidth;
    const height = sceneContainer.value.clientHeight;
    
    // Проверка и исправление размеров контейнера
    let adjustedWidth = width;
    if (width === 0) {
      console.warn('Container width is zero, forcing to parent width or minimum of 300px');
      const parentWidth = sceneContainer.value.parentElement?.clientWidth || 300;
      adjustedWidth = Math.max(parentWidth, 300);
      sceneContainer.value.style.width = `${adjustedWidth}px`;
    }
    console.log('Using dimensions for renderer:', adjustedWidth, height);
    
    const aspect = adjustedWidth / height;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    // Изменяем начальную позицию камеры для лучшего обзора
    camera.position.set(5, 12, 15);
    camera.lookAt(0, 0, 0);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      powerPreference: "high-performance" 
    });
    renderer.setSize(adjustedWidth, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Append renderer to container
    sceneContainer.value.innerHTML = '';
    sceneContainer.value.appendChild(renderer.domElement);
    
    // Create orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI * 0.85; // Позволяет камере немного заглянуть внутрь
    controls.minDistance = 3; // Позволяет камере подойти ближе
    controls.maxDistance = 50;
    
    // Setup stats
    stats = new Stats();
    stats.dom.style.position = 'absolute';
    stats.dom.style.top = '0px';
    stats.dom.style.left = '0px';
    stats.dom.style.opacity = '0.5';
    sceneContainer.value.appendChild(stats.dom);
    
    // Create raycaster for interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    // Add directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 30, 20);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
    scene.add(directionalLight);
    
    // Add helpers for debugging
    if (process.env.NODE_ENV === 'development') {
      // Grid helper
      const gridHelper = new THREE.GridHelper(50, 50);
      scene.add(gridHelper);
      
      // Axes helper
      const axesHelper = new THREE.AxesHelper(5);
      scene.add(axesHelper);
      
      // Directional light helper
      const dirLightHelper = new THREE.DirectionalLightHelper(directionalLight, 10);
      scene.add(dirLightHelper);
    }
    
    // Create ground
    createGround();
    
    // Build house
    buildHouse();
    
    // Add event listeners
    window.addEventListener('resize', onWindowResize);
    sceneContainer.value.addEventListener('click', onMouseClick);
    
    // Setup drag and drop
    setupDragAndDrop();
    
    // Setup view buttons
    setupViewButtons();
    
    // Start animation
    animate();
    
    // Show controls hint for a few seconds
    showControlsHint.value = true;
    hintTimerId = window.setTimeout(() => {
      showControlsHint.value = false;
    }, 5000);
    
    // Update counts
    updateObjectCounts();
    
    // Проверяем доступные материалы
    if (DEBUG.enabled) {
      checkMaterials();
    }
    
    // Finish loading
    isLoading.value = false;
    
    // Notify success
    notificationStore.addSuccess('3D модель успешно загружена');
    
    // Добавляем автоматическое перемещение камеры в позицию обзора сверху
    setTimeout(() => {
      // Перемещаем камеру вверх для обзора всего дома
      new TWEEN.Tween(camera.position)
        .to({
          x: 0,
          y: 15,
          z: 10
        }, 1500)
        .easing(TWEEN.Easing.Cubic.InOut)
        .start();
      
      // Направляем камеру на центр дома
      new TWEEN.Tween(controls.target)
        .to({
          x: 0,
          y: 1.5,
          z: 0
        }, 1500)
        .easing(TWEEN.Easing.Cubic.InOut)
        .start();
    }, 500);
    
  } catch (err) {
    console.error('Error initializing 3D scene:', err);
    error.value = err instanceof Error ? err.message : 'Ошибка при инициализации 3D сцены';
    isLoading.value = false;
    notificationStore.addError('Ошибка при загрузке 3D модели: ' + error.value);
    
    // Clean up if error occurs
    cleanupResources();
  }
};

// Функция для проверки доступных материалов
const checkMaterials = () => {
  console.log('%cMaterials Check', 'background: #222; color: #bada55; font-size: 16px');
  
  // Список ожидаемых материалов
  const expectedMaterials = [
    'floor', 'floorWood', 'floorTile', 'floorCarpet', 
    'parquetFloor', 'carpetBeige', 'carpetBlue',
    'fabricSofa', 'leatherSofa', 'darkWood', 'whiteWood',
    'metalChrome', 'blackMetal', 'wall', 'wallSelected',
    'roof', 'frame', 'glass', 'ground', 'bedSheet'
  ];
  
  // Проверяем каждый материал
  expectedMaterials.forEach(materialName => {
    if (materials[materialName as keyof typeof materials]) {
      console.log(`✅ Material '${materialName}' exists`);
    } else {
      console.warn(`❌ Material '${materialName}' is MISSING`);
    }
  });
  
  // Логируем все доступные материалы
  console.log('All defined materials:', Object.keys(materials));
};

// Create ground with landscape elements
const createGround = () => {
  // Main ground surface
  const groundGeometry = new THREE.PlaneGeometry(100, 100);
  const ground = new THREE.Mesh(groundGeometry, materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0; // Устанавливаем точно на ноль
  ground.receiveShadow = true;
  scene.add(ground);
  
  // Path to house
  const pathGeometry = new THREE.PlaneGeometry(3, 15);
  const pathMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xbdbdbd, 
    roughness: 0.9
  });
  const path = new THREE.Mesh(pathGeometry, pathMaterial);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, 10);
  path.receiveShadow = true;
  scene.add(path);
  
  // Add trees
  addTrees();
};

// Add trees around the house
const addTrees = () => {
  // Tree creation helper function
  const createTree = (x: number, z: number, scale: number = 1) => {
    const treeGroup = new THREE.Group();
    
    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.3 * scale, 0.4 * scale, 2 * scale, 8);
    const trunk = new THREE.Mesh(trunkGeometry, materials.wood);
    trunk.position.y = 1 * scale;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);
    
    // Crown
    const crownGeometry = new THREE.ConeGeometry(1.5 * scale, 3 * scale, 8);
    const crownMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x388e3c, 
      roughness: 0.8 
    });
    const crown = new THREE.Mesh(crownGeometry, crownMaterial);
    crown.position.y = 3.5 * scale;
    crown.castShadow = true;
    crown.receiveShadow = true;
    treeGroup.add(crown);
    
    // Position tree
    treeGroup.position.set(x, 0, z);
    scene.add(treeGroup);
    
    return treeGroup;
  };
  
  // Add trees with varying sizes
  createTree(-10, -15, 1.2);
  createTree(-8, -10, 0.9);
  createTree(12, -12, 1.0);
  createTree(15, -8, 1.1);
  createTree(-15, 5, 0.8);
  createTree(18, 8, 1.3);
};

// Build house from store data
// Build house from store data
  const buildHouse = () => {
    if (!rooms.value || rooms.value.length === 0) {
      console.warn('No rooms data available for building house');
      return;
    }

    // Create house group
    const houseGroup = new THREE.Group();
    houseGroup.position.y = 1.5; // Поднимаем весь дом на 1.5 единицы над землей
    scene.add(houseGroup);

    // House dimensions (могут быть неточными, т.к. зависят от комнат)
    // const houseWidth = 15;
    // const houseDepth = 12;
    const roomHeight = 3;

    // --- ИСПРАВЛЕННЫЙ roomLayout ---
    const roomLayout: {
      id: string;
      position: THREE.Vector3;
      size: THREE.Vector3;
      doors: { to: string; wall: 'north' | 'east' | 'south' | 'west'; offset: number }[];
      windows: { wall: 'north' | 'east' | 'south' | 'west'; offset: number; width: number }[];
    }[] = [];

    // Living room (center)
    const livingRoom = rooms.value.find(r => r.type === 'living');
    if (livingRoom) {
      roomLayout.push({
        id: livingRoom.id,
        position: new THREE.Vector3(0, 0, 0), // Центр гостиной
        size: new THREE.Vector3(8, roomHeight, 7), // Ширина 8, Глубина 7
        doors: [
          { to: 'outside', wall: 'south', offset: 0 },  // Входная дверь
          // Дверь в кухню (стена west гостиной, на X = -4)
          { to: 'kitchen', wall: 'west', offset: 0 }, // offset 0 от центра стены Z=0
           // Дверь в спальню (стена east гостиной, на X = 4)
          { to: 'bedroom', wall: 'east', offset: -1 } // offset -1 от центра стены Z=0
        ],
        windows: [
          { wall: 'south', offset: -2.5, width: 1.5 },
          { wall: 'south', offset: 2.5, width: 1.5 },
        ]
      });
    }

    // Kitchen (left of living room)
    const kitchen = rooms.value.find(r => r.type === 'kitchen');
    if (kitchen) {
       // Гостиная западная стена X = 0 - 8/2 = -4
       // Кухня ширина 4, полуширина 2. Центр X = -4 - 2 = -6.
      roomLayout.push({
        id: kitchen.id,
        position: new THREE.Vector3(-6, 0, 0), // Центр кухни
        size: new THREE.Vector3(4, roomHeight, 7), // Ширина 4, Глубина 7
        doors: [
          // Дверь в гостиную (стена east кухни, на X = -6 + 4/2 = -4)
          // Эта дверь дублирует дверь из гостиной, можно оставить только одну
          // { to: livingRoom?.id || '', wall: 'east', offset: 0 }
        ],
        windows: [
          { wall: 'south', offset: 0, width: 1.5 }, // Южное окно
          { wall: 'west', offset: 0, width: 1.5 },  // Западное окно
        ]
      });
    }

    // Bedroom (right of living room)
    const bedroom = rooms.value.find(r => r.type === 'bedroom');
    if (bedroom) {
      // Гостиная восточная стена X = 0 + 8/2 = 4
      // Спальня ширина 5, полуширина 2.5. Центр X = 4 + 2.5 = 6.5.
      roomLayout.push({
        id: bedroom.id,
        position: new THREE.Vector3(6.5, 0, 0), // <<< ИСПРАВЛЕНО X координата
        size: new THREE.Vector3(5, roomHeight, 7), // Ширина 5, Глубина 7
        doors: [
           // Дверь в гостиную (стена west спальни, на X = 6.5 - 5/2 = 4)
           // Эта дверь дублирует дверь из гостиной, можно оставить только одну
          // { to: livingRoom?.id || '', wall: 'west', offset: -1 }
          // Дверь в ванную (стена north спальни, на Z = 0 - 7/2 = -3.5)
          { to: 'bathroom', wall: 'north', offset: 1 } // offset 1 от центра X=6.5
        ],
        windows: [
          { wall: 'south', offset: 0, width: 1.5 }, // Южное окно
          { wall: 'east', offset: 0, width: 1.5 },  // Восточное окно
        ]
      });
    }

    // Bathroom (behind bedroom, north side)
    const bathroom = rooms.value.find(r => r.type === 'bathroom');
    if (bathroom) {
        // Спальня северная стена Z = 0 - 7/2 = -3.5
        // Ванная глубина 4, полуглубина 2. Центр Z = -3.5 - 2 = -5.5.
        // Центр X совпадает со спальней = 6.5
      roomLayout.push({
        id: bathroom.id,
        position: new THREE.Vector3(6.5, 0, -5.5), // <<< ИСПРАВЛЕНО X и Z координаты
        size: new THREE.Vector3(5, roomHeight, 4), // Ширина 5, Глубина 4
        doors: [
           // Дверь в спальню (стена south ванной, на Z = -5.5 + 4/2 = -3.5)
           // Эта дверь дублирует дверь из спальни, можно оставить только одну
          // { to: bedroom?.id || '', wall: 'south', offset: 1 }
        ],
        windows: [
          { wall: 'north', offset: 0, width: 1 }, // Северное окно (маленькое)
        ]
      });
    }
    // --- КОНЕЦ ИСПРАВЛЕННОГО roomLayout ---

    // Create rooms based on layout
    roomLayout.forEach(roomConfig => {
      const roomData = rooms.value.find(r => r.id === roomConfig.id);
      if (roomData) { // Проверка, что комната найдена в store
        createRoom(
          houseGroup,
          roomData, // Передаем найденные данные комнаты
          roomConfig.position,
          roomConfig.size,
          roomConfig.doors,
          roomConfig.windows
        );
      } else {
         console.warn(`Room data not found in store for id: ${roomConfig.id}`);
      }
    });

    // Add roof (нужно пересчитать размеры, если они зависели от старых houseWidth/Depth)
    // Рассчитаем реальные габариты дома по комнатам
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    roomLayout.forEach(rc => {
        minX = Math.min(minX, rc.position.x - rc.size.x / 2);
        maxX = Math.max(maxX, rc.position.x + rc.size.x / 2);
        minZ = Math.min(minZ, rc.position.z - rc.size.z / 2);
        maxZ = Math.max(maxZ, rc.position.z + rc.size.z / 2);
    });
    const calculatedWidth = maxX - minX;
    const calculatedDepth = maxZ - minZ;
    // Центр дома для крыши
    const houseCenterX = minX + calculatedWidth / 2;
    const houseCenterZ = minZ + calculatedDepth / 2;

    console.log(`Calculated house dimensions: Width=${calculatedWidth}, Depth=${calculatedDepth}`);
    console.log(`Calculated house center: X=${houseCenterX}, Z=${houseCenterZ}`);

    createRoof(houseGroup, calculatedWidth, calculatedDepth, houseCenterX, houseCenterZ); // Передаем центр
  };

// Добавляем offsetX и offsetZ для центрирования крыши над фактическим домом
const createRoof = (houseGroup: THREE.Group, width: number, depth: number, offsetX: number = 0, offsetZ: number = 0) => {
    // Lower height for more compact appearance
    const roofHeight = 2.5;
    
    // Calculate the exact wall height - assuming room height is 3 units and walls extend to half
    const wallTopY = 1.5; // This is where walls end (relative to room center)
    
    // No overhang, align exactly with walls to avoid gaps
    const roofWidth = width;
    const roofDepth = depth;
    
    // Create double-sided transparent material for the roof
    const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0x795548,
        roughness: 0.7,
        metalness: 0.3,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide // Make it visible from both sides
    });

    // Create geometry for the roof
    const roofGeometry = new THREE.BufferGeometry();
    
    // Define roof vertices - starting exactly at wall top height
    const vertices = new Float32Array([
        // Left side of roof
        offsetX - roofWidth / 2, wallTopY, offsetZ - roofDepth / 2,  // front left bottom
        offsetX - roofWidth / 2, wallTopY, offsetZ + roofDepth / 2,  // back left bottom
        offsetX, wallTopY + roofHeight, offsetZ - roofDepth / 2,      // front top
        offsetX, wallTopY + roofHeight, offsetZ + roofDepth / 2,      // back top
        
        // Right side of roof
        offsetX + roofWidth / 2, wallTopY, offsetZ - roofDepth / 2,  // front right bottom
        offsetX + roofWidth / 2, wallTopY, offsetZ + roofDepth / 2,  // back right bottom
        offsetX, wallTopY + roofHeight, offsetZ - roofDepth / 2,      // front top (same as left side)
        offsetX, wallTopY + roofHeight, offsetZ + roofDepth / 2,      // back top (same as left side)
    ]);

    // Define the triangles using indices
    const indices = [
        // Left side triangles
        0, 2, 1,  // front left
        1, 2, 3,  // back left
        
        // Right side triangles
        4, 5, 6,  // front right
        5, 7, 6   // back right
    ];

    roofGeometry.setIndex(indices);
    roofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    roofGeometry.computeVertexNormals();

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.castShadow = true;
    roof.userData = { type: 'roof' };
    houseGroup.add(roof);

    // Front gable - using same material and double-sided rendering
    const frontGableGeometry = new THREE.BufferGeometry();
    const frontGableVertices = new Float32Array([
        offsetX - width / 2, wallTopY, offsetZ + depth / 2,           // bottom left
        offsetX + width / 2, wallTopY, offsetZ + depth / 2,           // bottom right
        offsetX, wallTopY + roofHeight, offsetZ + depth / 2           // top center
    ]);
    frontGableGeometry.setAttribute('position', new THREE.BufferAttribute(frontGableVertices, 3));
    frontGableGeometry.setIndex([0, 1, 2]);
    frontGableGeometry.computeVertexNormals();
    
    // Gable material - slightly less transparent than the roof
    const gableMaterial = new THREE.MeshStandardMaterial({
        color: 0xf5f5f5,
        roughness: 0.8,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
    });
    
    const frontGable = new THREE.Mesh(frontGableGeometry, gableMaterial);
    frontGable.castShadow = true;
    frontGable.userData = { type: 'roof' };
    houseGroup.add(frontGable);

    // Back gable - using same approach
    const backGableGeometry = new THREE.BufferGeometry();
    const backGableVertices = new Float32Array([
        offsetX - width / 2, wallTopY, offsetZ - depth / 2,           // bottom left
        offsetX + width / 2, wallTopY, offsetZ - depth / 2,           // bottom right
        offsetX, wallTopY + roofHeight, offsetZ - depth / 2           // top center
    ]);
    backGableGeometry.setAttribute('position', new THREE.BufferAttribute(backGableVertices, 3));
    backGableGeometry.setIndex([0, 1, 2]);
    backGableGeometry.computeVertexNormals();
    
    const backGable = new THREE.Mesh(backGableGeometry, gableMaterial);
    backGable.castShadow = true;
    backGable.userData = { type: 'roof' };
    houseGroup.add(backGable);
};

// При первой загрузке автоматически отключаем крышу для лучшего просмотра интерьера
setTimeout(() => {
  if (scene) {
    scene.traverse((object) => {
      if (object.userData && object.userData.type === 'roof') {
        object.visible = false;
      }
    });
  }
}, 1000);

// Create a room with walls, floor, windows and doors
const createRoom = (
  houseGroup: THREE.Group,
  room: any, 
  position: THREE.Vector3, 
  size: THREE.Vector3,
  doors: { to: string; wall: 'north' | 'east' | 'south' | 'west'; offset: number }[],
  windows: { wall: 'north' | 'east' | 'south' | 'west'; offset: number; width: number }[]
) => {
  if (!room) return;
  
  // Create room group
  const roomGroup = new THREE.Group();
  roomGroup.position.copy(position);
  roomGroup.userData = { roomId: room.id, type: 'room' };
  houseGroup.add(roomGroup);
  roomMeshes.set(room.id, roomGroup);
  
  // Room color based on type
  const roomColor = roomColors[room.type as keyof typeof roomColors] || roomColors.default;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: roomColor,
    roughness: 0.8,
    metalness: 0.2
  });
  
  // Room walls collection
  const walls: THREE.Mesh[] = [];
  
  // Choose floor material based on room type
  let floorMaterial;
  switch(room.type) {
    case 'living':
      floorMaterial = materials.floorWood;
      break;
    case 'kitchen':
      floorMaterial = materials.floorTile;
      break;
    case 'bedroom':
      floorMaterial = materials.floorCarpet;
      break;
    default:
      floorMaterial = materials.floor;
  }
  
  // Create floor
  const floorGeometry = new THREE.BoxGeometry(size.x, 0.1, size.z);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.position.y = -size.y / 2;
  floor.receiveShadow = true;
  roomGroup.add(floor);
  roomFloors.set(room.id, floor);
  
  // Helper function to create walls
  const createWall = (width: number, height: number, depth: number, posX: number, posY: number, posZ: number, rotY: number = 0) => {
    const wallGeometry = new THREE.BoxGeometry(width, height, depth);
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(posX, posY, posZ);
    wall.rotation.y = rotY;
    wall.castShadow = true;
    wall.receiveShadow = true;
    roomGroup.add(wall);
    walls.push(wall);
    return wall;
  };
  
  // Create room walls
  const wallThickness = 0.2;
  const halfWidth = size.x / 2;
  const halfDepth = size.z / 2;
  const halfHeight = size.y / 2;
  
  // Front wall (south)
  const frontWall = createWall(size.x, size.y, wallThickness, 0, 0, halfDepth);
  frontWall.userData = { wall: 'south' };
  
  // Back wall (north)
  const backWall = createWall(size.x, size.y, wallThickness, 0, 0, -halfDepth);
  backWall.userData = { wall: 'north' };
  
  // Left wall (west)
  const leftWall = createWall(size.z, size.y, wallThickness, -halfWidth, 0, 0, Math.PI / 2);
  leftWall.userData = { wall: 'west' };
  
  // Right wall (east)
  const rightWall = createWall(size.z, size.y, wallThickness, halfWidth, 0, 0, Math.PI / 2);
  rightWall.userData = { wall: 'east' };
  
  // Add walls to room list
  roomWalls.set(room.id, walls);
  
  // Add doors and windows
  doors.forEach(door => {
    createDoor(roomGroup, door, size, wallThickness);
  });
  
  windows.forEach(window => {
    createWindow(roomGroup, window, size, wallThickness);
  });
  
  // Add interior based on room type
  switch(room.type) {
    case 'living':
      addLivingRoomFurniture(roomGroup, size);
      break;
    case 'bedroom':
      addBedroomFurniture(roomGroup, size);
      break;
    case 'kitchen':
      addKitchenFurniture(roomGroup, size);
      break;
  }
  
  // Add devices to room
  if (room.devices) {
    const devicesPositions = calculateDevicePositions(room.devices.length, size);
    
    room.devices.forEach((device: any, index: number) => {
      const devicePosition = devicesPositions[index % devicesPositions.length];
      
      if (device.type === 'light') {
        // Place light on ceiling
        createLightFixture(
          roomGroup,
          device,
          new THREE.Vector3(devicePosition.x, halfHeight - 0.1, devicePosition.z)
        );
      } else if (device.type === 'fan') {
        // Place fan on ceiling
        createFan(
          roomGroup,
          device,
          new THREE.Vector3(devicePosition.x, halfHeight - 0.3, devicePosition.z)
        );
      } else if (device.type === 'thermostat') {
        // Place thermostat on wall
        createThermostat(
          roomGroup,
          device,
          new THREE.Vector3(-halfWidth + 0.01, 0, -halfDepth + 1)
        );
      }
    });
  }
  
  // НОВЫЙ КОД - Добавляем вспомогательные индикаторы в комнатах
  if (DEBUG.enabled) {
    // Маркируем центр комнаты ярким маркером
    const centerSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    centerSphere.position.set(0, 0, 0);
    roomGroup.add(centerSphere);
    
    // Проверка видимости мебели в комнате (с задержкой)
    setTimeout(() => {
      console.log(`Checking furniture visibility in room: ${room.id} (${room.type})`);
      let count = 0;
      roomGroup.traverse((object) => {
        if (object instanceof THREE.Mesh && object.name.includes('_')) {
          count++;
          console.log(
            `Furniture item: ${object.name}, ` + 
            `Position: (${object.position.x.toFixed(2)}, ${object.position.y.toFixed(2)}, ${object.position.z.toFixed(2)}), ` +
            `Scale: (${object.scale.x.toFixed(2)}, ${object.scale.y.toFixed(2)}, ${object.scale.z.toFixed(2)}), ` + 
            `Visible: ${object.visible}`
          );
        }
      });
      console.log(`Found ${count} furniture items in room ${room.id}`);
    }, 1000);
  }
};

// Create door
const createDoor = (
  roomGroup: THREE.Group,
  door: { to: string; wall: 'north' | 'east' | 'south' | 'west'; offset: number },
  roomSize: THREE.Vector3,
  wallThickness: number
) => {
  const doorWidth = door.to === 'outside' ? 1.1 : 0.9;
  const doorHeight = 2.2;
  const halfWidth = roomSize.x / 2;
  const halfDepth = roomSize.z / 2;
  const halfHeight = roomSize.y / 2;
  
  let doorPosition: THREE.Vector3;
  let doorRotation = 0;
  
  // Determine position and rotation based on wall
  switch (door.wall) {
    case 'north':
      doorPosition = new THREE.Vector3(door.offset, -halfHeight + doorHeight / 2, -halfDepth);
      doorRotation = Math.PI;
      break;
    case 'east':
      doorPosition = new THREE.Vector3(halfWidth, -halfHeight + doorHeight / 2, door.offset);
      doorRotation = -Math.PI / 2;
      break;
    case 'south':
      doorPosition = new THREE.Vector3(door.offset, -halfHeight + doorHeight / 2, halfDepth);
      doorRotation = 0;
      break;
    case 'west':
      doorPosition = new THREE.Vector3(-halfWidth, -halfHeight + doorHeight / 2, door.offset);
      doorRotation = Math.PI / 2;
      break;
  }
  
  // Create doorframe
  const frameGeometry = new THREE.BoxGeometry(doorWidth + 0.1, doorHeight + 0.05, wallThickness * 1.1);
  const doorFrame = new THREE.Mesh(frameGeometry, materials.frame);
  doorFrame.position.copy(doorPosition);
  doorFrame.rotation.y = doorRotation;
  roomGroup.add(doorFrame);
  
  // Create door
  const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, wallThickness / 2);
  const doorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xa1887f, 
    roughness: 0.7,
    metalness: 0.1
  });
  const doorMesh = new THREE.Mesh(doorGeometry, doorMaterial);
  
  // Slightly offset the door to be at the edge of the frame
  let doorOffsetX = 0;
  let doorOffsetZ = 0;
  
  if (door.wall === 'north' || door.wall === 'south') {
    doorOffsetZ = wallThickness * 0.6;
    if (door.wall === 'north') doorOffsetZ *= -1;
  } else {
    doorOffsetX = wallThickness * 0.6;
    if (door.wall === 'west') doorOffsetX *= -1;
  }
  
  doorMesh.position.set(
    doorPosition.x + doorOffsetX,
    doorPosition.y,
    doorPosition.z + doorOffsetZ
  );
  doorMesh.rotation.y = doorRotation;
  roomGroup.add(doorMesh);
  
  // Add door handle
  const handleGeometry = new THREE.SphereGeometry(0.05);
  const handleMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xb0bec5, 
    roughness: 0.5,
    metalness: 0.8
  });
  const doorHandle = new THREE.Mesh(handleGeometry, handleMaterial);
  
  // Position handle on door
  const handleOffsetX = doorWidth * 0.3;
  const handleOffsetY = 0;
  
  if (door.wall === 'north' || door.wall === 'south') {
    doorHandle.position.set(
      doorPosition.x + handleOffsetX,
      doorPosition.y + handleOffsetY,
      doorPosition.z + doorOffsetZ + (wallThickness * 0.26)
    );
  } else {
    doorHandle.position.set(
      doorPosition.x + doorOffsetX + (wallThickness * 0.26),
      doorPosition.y + handleOffsetY,
      doorPosition.z + handleOffsetX
    );
  }
  
  roomGroup.add(doorHandle);
};

// Create window
const createWindow = (
  roomGroup: THREE.Group,
  window: { wall: 'north' | 'east' | 'south' | 'west'; offset: number; width: number },
  roomSize: THREE.Vector3,
  wallThickness: number
) => {
  const windowWidth = window.width;
  const windowHeight = 1.2;
  const windowOffsetY = 0.3; // offset from center of room on Y
  const halfWidth = roomSize.x / 2;
  const halfDepth = roomSize.z / 2;
  
  let windowPosition: THREE.Vector3;
  let windowRotation = 0;
  
  // Determine position and rotation based on wall
  switch (window.wall) {
    case 'north':
      windowPosition = new THREE.Vector3(window.offset, windowOffsetY, -halfDepth);
      windowRotation = Math.PI;
      break;
    case 'east':
      windowPosition = new THREE.Vector3(halfWidth, windowOffsetY, window.offset);
      windowRotation = -Math.PI / 2;
      break;
    case 'south':
      windowPosition = new THREE.Vector3(window.offset, windowOffsetY, halfDepth);
      windowRotation = 0;
      break;
    case 'west':
      windowPosition = new THREE.Vector3(-halfWidth, windowOffsetY, window.offset);
      windowRotation = Math.PI / 2;
      break;
  }
  
  // Create window frame
  const frameGeometry = new THREE.BoxGeometry(windowWidth + 0.1, windowHeight + 0.1, wallThickness * 1.1);
  const windowFrame = new THREE.Mesh(frameGeometry, materials.frame);
  windowFrame.position.copy(windowPosition);
  windowFrame.rotation.y = windowRotation;
  roomGroup.add(windowFrame);
  
  // Create glass
  const glassGeometry = new THREE.BoxGeometry(windowWidth, windowHeight, wallThickness / 5);
  const glass = new THREE.Mesh(glassGeometry, materials.glass);
  
  // Slightly offset glass from frame
  let glassOffsetX = 0;
  let glassOffsetZ = 0;
  
  if (window.wall === 'north' || window.wall === 'south') {
    glassOffsetZ = wallThickness * 0.1;
    if (window.wall === 'north') glassOffsetZ *= -1;
  } else {
    glassOffsetX = wallThickness * 0.1;
    if (window.wall === 'west') glassOffsetX *= -1;
  }
  
  glass.position.set(
    windowPosition.x + glassOffsetX,
    windowPosition.y,
    windowPosition.z + glassOffsetZ
  );
  glass.rotation.y = windowRotation;
  roomGroup.add(glass);
  
  // Create window dividers
  const dividerMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x8d6e63, 
    roughness: 0.6,
    metalness: 0.2 
  });
  
  // Vertical divider
  const verticalDividerGeometry = new THREE.BoxGeometry(0.05, windowHeight, wallThickness / 3);
  const verticalDivider = new THREE.Mesh(verticalDividerGeometry, dividerMaterial);
  verticalDivider.position.copy(glass.position);
  verticalDivider.rotation.y = windowRotation;
  roomGroup.add(verticalDivider);
  
  // Horizontal divider
  const horizontalDividerGeometry = new THREE.BoxGeometry(windowWidth, 0.05, wallThickness / 3);
  const horizontalDivider = new THREE.Mesh(horizontalDividerGeometry, dividerMaterial);
  horizontalDivider.position.copy(glass.position);
  horizontalDivider.rotation.y = windowRotation;
  roomGroup.add(horizontalDivider);
};
  
// Исправленная функция для добавления мебели в спальню
const addBedroomFurniture = (roomGroup: THREE.Group, size: THREE.Vector3) => {
  DEBUG.logFurniture('Creating detailed bedroom furniture', roomGroup);

  try {
    const halfWidth = size.x / 2;
    const halfDepth = size.z / 2;
    const floorY = -size.y / 2;
    const wallOffset = 0.1;
    const furnitureBaseHeight = floorY + 0.1;

    // 1. Пол (деревянный)
    const roomFloor = roomFloors.get(roomGroup.userData.roomId as string);
    if (roomFloor) {
      roomFloor.material = verifyMaterial(materials.floorWood, 'floor');
      DEBUG.logFurniture('Bedroom floor updated to wood', roomFloor);
    }

    // 2. Ковер (синий)
    const carpetWidth = size.x * 0.5;
    const carpetDepth = size.z * 0.7;
    const carpetGeometry = new THREE.BoxGeometry(carpetWidth, 0.03, carpetDepth);
    const carpet = new THREE.Mesh(carpetGeometry, verifyMaterial(materials.carpetBlue, 'floorCarpet'));
    carpet.name = 'bedroom_carpet';
    carpet.position.set(0, floorY + 0.015, 0);
    carpet.receiveShadow = true;
    roomGroup.add(carpet);
    DEBUG.logFurniture('Bedroom carpet added', carpet);

    // 3. Кровать (более детальная)
    const bedGroup = new THREE.Group();
    bedGroup.name = 'bed_detailed';
    const bedWidth = 1.8;
    const bedLength = 2.1;
    const bedFrameHeight = 0.3;
    const headboardHeight = 0.9;
    const mattressHeight = 0.2;

    // Каркас кровати
    const frameMat = verifyMaterial(materials.whiteWood, 'wood');
    const frameSideGeo = new THREE.BoxGeometry(bedWidth, bedFrameHeight, 0.05);
    const frameEndGeo = new THREE.BoxGeometry(0.05, bedFrameHeight, bedLength - 0.1);

    const frameFront = new THREE.Mesh(frameSideGeo, frameMat);
    frameFront.position.set(0, bedFrameHeight / 2, bedLength / 2 - 0.025);
    frameFront.castShadow = true;
    bedGroup.add(frameFront);

    const frameBack = new THREE.Mesh(frameSideGeo, frameMat);
    frameBack.position.set(0, bedFrameHeight / 2, -bedLength / 2 + 0.025);
    frameBack.castShadow = true;
    bedGroup.add(frameBack);

    const frameLeft = new THREE.Mesh(frameEndGeo, frameMat);
    frameLeft.position.set(-bedWidth / 2 + 0.025, bedFrameHeight / 2, 0);
    frameLeft.castShadow = true;
    bedGroup.add(frameLeft);

    const frameRight = new THREE.Mesh(frameEndGeo, frameMat);
    frameRight.position.set(bedWidth / 2 - 0.025, bedFrameHeight / 2, 0);
    frameRight.castShadow = true;
    bedGroup.add(frameRight);

    // Изголовье
    const headboardGeo = new THREE.BoxGeometry(bedWidth, headboardHeight, 0.08);
    const headboard = new THREE.Mesh(headboardGeo, frameMat);
    headboard.position.set(0, headboardHeight / 2, -bedLength / 2 - 0.04);
    headboard.castShadow = true;
    bedGroup.add(headboard);

    // Матрас
    const mattressGeo = new THREE.BoxGeometry(bedWidth * 0.98, mattressHeight, bedLength * 0.98);
    const mattress = new THREE.Mesh(mattressGeo, verifyMaterial(materials.bedSheet, 'fabricCream'));
    mattress.position.y = bedFrameHeight + mattressHeight / 2 - 0.05; // Чуть ниже края рамы
    mattress.castShadow = true;
    bedGroup.add(mattress);

    // Подушки (2 шт)
    const pillowWidth = bedWidth * 0.4;
    const pillowHeight = 0.15;
    const pillowDepth = 0.4;
    const pillowGeo = new THREE.BoxGeometry(pillowWidth, pillowHeight, pillowDepth);
    const pillowMat = verifyMaterial(materials.bedSheet, 'fabricCream');

    const pillow1 = new THREE.Mesh(pillowGeo, pillowMat);
    pillow1.position.set(-bedWidth * 0.25, mattress.position.y + mattressHeight / 2 + pillowHeight / 2, -bedLength / 2 * 0.6);
    pillow1.rotation.x = -Math.PI / 12; // Немного наклонены
    pillow1.castShadow = true;
    bedGroup.add(pillow1);

    const pillow2 = new THREE.Mesh(pillowGeo, pillowMat);
    pillow2.position.set(bedWidth * 0.25, mattress.position.y + mattressHeight / 2 + pillowHeight / 2, -bedLength / 2 * 0.6);
    pillow2.rotation.x = -Math.PI / 12;
    pillow2.castShadow = true;
    bedGroup.add(pillow2);

    // Покрывало (сложенное)
    const blanketGeo = new THREE.BoxGeometry(bedWidth * 0.98, 0.05, bedLength * 0.3);
    const blanket = new THREE.Mesh(blanketGeo, verifyMaterial(materials.carpetBlue, 'fabricSofa')); // Контрастный цвет
    blanket.position.set(0, mattress.position.y + mattressHeight / 2 + 0.025, bedLength * 0.35);
    blanket.castShadow = true;
    bedGroup.add(blanket);

    bedGroup.position.set(0, furnitureBaseHeight, 0); // В центре по глубине
    bedGroup.rotation.y = Math.PI / 2; // Повернуть изголовьем к боковой стене
    roomGroup.add(bedGroup);
    DEBUG.logFurniture('Detailed bed added', bedGroup);

    // 4. Прикроватные тумбочки (2 шт)
    const createNightstand = (posX: number, posZ: number) => {
      const standGroup = new THREE.Group();
      const standWidth = 0.5;
      const standDepth = 0.4;
      const standHeight = 0.6;

      // Корпус
      const standBodyGeo = new THREE.BoxGeometry(standWidth, standHeight, standDepth);
      const standBody = new THREE.Mesh(standBodyGeo, verifyMaterial(materials.whiteWood, 'wood'));
      standBody.position.y = standHeight / 2;
      standBody.castShadow = true;
      standGroup.add(standBody);

      // Ручка ящика (маленький цилиндр)
      const handleRadius = 0.02;
      const handleLength = 0.02;
      const handleGeo = new THREE.CylinderGeometry(handleRadius, handleRadius, handleLength, 8);
      const handleMat = verifyMaterial(materials.metalGold, 'metallic'); // Золотая ручка
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(0, standHeight * 0.7, standDepth / 2 + handleLength / 2);
      handle.rotation.x = Math.PI / 2;
      standGroup.add(handle);

      standGroup.position.set(posX, furnitureBaseHeight, posZ);
      standGroup.rotation.y = bedGroup.rotation.y; // Повернуть так же, как кровать
      return standGroup;
    };

    const standOffset = bedWidth / 2 + 0.35; // Отступ от кровати
    const nightstand1 = createNightstand(standOffset, 0);
    roomGroup.add(nightstand1);
    const nightstand2 = createNightstand(-standOffset, 0);
    roomGroup.add(nightstand2);
    DEBUG.logFurniture('Nightstands added', nightstand1);

    // 5. Шкаф
    const wardrobeGroup = new THREE.Group();
    wardrobeGroup.name = 'wardrobe_detailed';
    const wardrobeWidth = 1.5;
    const wardrobeDepth = 0.6;
    const wardrobeHeight = 2.0;

    // Корпус
    const wardrobeBodyGeo = new THREE.BoxGeometry(wardrobeWidth, wardrobeHeight, wardrobeDepth);
    const wardrobeBody = new THREE.Mesh(wardrobeBodyGeo, verifyMaterial(materials.whiteWood, 'wood'));
    wardrobeBody.position.y = wardrobeHeight / 2;
    wardrobeBody.castShadow = true;
    wardrobeGroup.add(wardrobeBody);

    // Двери (имитация ручек)
    const doorHandleHeight = 0.3;
    const doorHandleWidth = 0.02;
    const handleGeo = new THREE.BoxGeometry(doorHandleWidth, doorHandleHeight, 0.01);
    const handleMat = verifyMaterial(materials.metalGold, 'metallic');

    const handle1 = new THREE.Mesh(handleGeo, handleMat);
    handle1.position.set(-wardrobeWidth * 0.25, wardrobeHeight * 0.5, wardrobeDepth / 2 + 0.005);
    wardrobeGroup.add(handle1);

    const handle2 = new THREE.Mesh(handleGeo, handleMat);
    handle2.position.set(wardrobeWidth * 0.25, wardrobeHeight * 0.5, wardrobeDepth / 2 + 0.005);
    wardrobeGroup.add(handle2);

    wardrobeGroup.position.set(halfWidth - wardrobeWidth / 2 - wallOffset, furnitureBaseHeight, -halfDepth + wardrobeDepth / 2 + wallOffset); // В углу
    wardrobeGroup.rotation.y = -Math.PI / 2; // Повернуть фасадом в комнату
    roomGroup.add(wardrobeGroup);
    DEBUG.logFurniture('Wardrobe added', wardrobeGroup);

  } catch (error) {
    console.error('Error in addBedroomFurniture:', error);
  }
};

// Исправленная функция для добавления мебели в гостиную
const addLivingRoomFurniture = (roomGroup: THREE.Group, size: THREE.Vector3) => {
  DEBUG.logFurniture('Creating detailed living room furniture', roomGroup);

  try {
    const halfWidth = size.x / 2;
    const halfDepth = size.z / 2;
    const floorY = -size.y / 2;
    const wallOffset = 0.2; // Небольшой отступ от стен
    const furnitureBaseHeight = floorY + 0.1; // Базовая высота над полом

    // 1. Пол (паркет)
    const roomFloor = roomFloors.get(roomGroup.userData.roomId as string);
    if (roomFloor) {
      roomFloor.material = verifyMaterial(materials.parquetFloor, 'floorWood');
      DEBUG.logFurniture('Living room floor updated to parquet', roomFloor);
    }

    // 2. Ковер (бежевый)
    const carpetWidth = size.x * 0.6;
    const carpetDepth = size.z * 0.5;
    const carpetGeometry = new THREE.BoxGeometry(carpetWidth, 0.03, carpetDepth);
    const carpet = new THREE.Mesh(carpetGeometry, verifyMaterial(materials.carpetBeige, 'floorCarpet'));
    carpet.name = 'living_room_carpet';
    carpet.position.set(0, floorY + 0.015, 0); // Почти на полу
    carpet.receiveShadow = true;
    roomGroup.add(carpet);
    DEBUG.logFurniture('Living room carpet added', carpet);

    // 3. Диван (более детальный)
    const sofaGroup = new THREE.Group();
    sofaGroup.name = 'living_room_sofa_detailed';
    const sofaWidth = 2.5;
    const sofaDepth = 0.9;
    const sofaHeight = 0.75;
    const seatHeight = 0.4;
    const armRestWidth = 0.2;

    // Основание дивана
    const baseGeo = new THREE.BoxGeometry(sofaWidth, seatHeight * 0.8, sofaDepth);
    const base = new THREE.Mesh(baseGeo, verifyMaterial(materials.fabricSofa, 'sofa'));
    base.position.y = seatHeight * 0.4;
    base.castShadow = true;
    sofaGroup.add(base);

    // Подушки сиденья (2 шт)
    const seatCushionWidth = (sofaWidth - armRestWidth * 2) / 2 * 0.95;
    const seatCushionGeo = new THREE.BoxGeometry(seatCushionWidth, seatHeight * 0.3, sofaDepth * 0.9);
    const seatCushionMat = verifyMaterial(materials.fabricSofa, 'sofa');
    const seat1 = new THREE.Mesh(seatCushionGeo, seatCushionMat);
    seat1.position.set(-seatCushionWidth / 2 - armRestWidth*0.05, seatHeight * 0.9, 0);
    seat1.castShadow = true;
    sofaGroup.add(seat1);
    const seat2 = new THREE.Mesh(seatCushionGeo, seatCushionMat);
    seat2.position.set(seatCushionWidth / 2 + armRestWidth*0.05, seatHeight * 0.9, 0);
    seat2.castShadow = true;
    sofaGroup.add(seat2);

    // Спинка
    const backGeo = new THREE.BoxGeometry(sofaWidth, sofaHeight - seatHeight, sofaDepth * 0.3);
    const back = new THREE.Mesh(backGeo, verifyMaterial(materials.fabricSofa, 'sofa'));
    back.position.set(0, seatHeight + (sofaHeight - seatHeight) / 2, -sofaDepth / 2 + (sofaDepth * 0.3) / 2);
    back.castShadow = true;
    sofaGroup.add(back);

    // Подлокотники
    const armGeo = new THREE.BoxGeometry(armRestWidth, sofaHeight * 0.7, sofaDepth);
    const arm1 = new THREE.Mesh(armGeo, verifyMaterial(materials.fabricSofa, 'sofa'));
    arm1.position.set(-sofaWidth / 2 + armRestWidth / 2, (sofaHeight * 0.7) / 2, 0);
    arm1.castShadow = true;
    sofaGroup.add(arm1);
    const arm2 = new THREE.Mesh(armGeo, verifyMaterial(materials.fabricSofa, 'sofa'));
    arm2.position.set(sofaWidth / 2 - armRestWidth / 2, (sofaHeight * 0.7) / 2, 0);
    arm2.castShadow = true;
    sofaGroup.add(arm2);

    // Ножки дивана (маленькие цилиндры)
    const legHeight = 0.08;
    const legRadius = 0.04;
    const legGeo = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8);
    const legMat = verifyMaterial(materials.darkWood, 'wood');
    const legPositions = [
        { x: -sofaWidth / 2 * 0.9, z: -sofaDepth / 2 * 0.9 },
        { x: sofaWidth / 2 * 0.9, z: -sofaDepth / 2 * 0.9 },
        { x: -sofaWidth / 2 * 0.9, z: sofaDepth / 2 * 0.9 },
        { x: sofaWidth / 2 * 0.9, z: sofaDepth / 2 * 0.9 },
    ];
    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(pos.x, legHeight / 2, pos.z);
        sofaGroup.add(leg);
    });

    sofaGroup.position.set(0, furnitureBaseHeight, -halfDepth + sofaDepth / 2 + 1.5); // Отодвинут от стены
    sofaGroup.rotation.y = 0; // Повернуть к центру, если нужно
    roomGroup.add(sofaGroup);
    DEBUG.logFurniture('Detailed sofa added', sofaGroup);

    // 4. Журнальный столик
    const tableGroup = new THREE.Group();
    tableGroup.name = 'coffee_table_detailed';
    const tableWidth = 1.2;
    const tableDepth = 0.6;
    const tableTopHeight = 0.05;
    const tableLegHeight = 0.4;

    // Столешница
    const tableTopGeo = new THREE.BoxGeometry(tableWidth, tableTopHeight, tableDepth);
    const tableTop = new THREE.Mesh(tableTopGeo, verifyMaterial(materials.whiteWood, 'wood'));
    tableTop.position.y = tableLegHeight + tableTopHeight / 2;
    tableTop.castShadow = true;
    tableGroup.add(tableTop);

    // Ножки стола (металлические)
    const tableLegWidth = 0.04;
    const tableLegGeo = new THREE.BoxGeometry(tableLegWidth, tableLegHeight, tableLegWidth);
    const tableLegMat = verifyMaterial(materials.metalChrome, 'metallic');
    const tableLegPositions = [
        { x: -tableWidth / 2 * 0.9, z: -tableDepth / 2 * 0.9 },
        { x: tableWidth / 2 * 0.9, z: -tableDepth / 2 * 0.9 },
        { x: -tableWidth / 2 * 0.9, z: tableDepth / 2 * 0.9 },
        { x: tableWidth / 2 * 0.9, z: tableDepth / 2 * 0.9 },
    ];
    tableLegPositions.forEach(pos => {
        const leg = new THREE.Mesh(tableLegGeo, tableLegMat);
        leg.position.set(pos.x, tableLegHeight / 2, pos.z);
        leg.castShadow = true;
        tableGroup.add(leg);
    });

    tableGroup.position.set(0, furnitureBaseHeight, 0); // Перед диваном
    roomGroup.add(tableGroup);
    DEBUG.logFurniture('Detailed coffee table added', tableGroup);

    // 5. Тумба под ТВ
    const tvStandGroup = new THREE.Group();
    tvStandGroup.name = 'tv_stand_detailed';
    const standWidth = 1.8;
    const standDepth = 0.4;
    const standHeight = 0.5;

    // Корпус тумбы
    const standBodyGeo = new THREE.BoxGeometry(standWidth, standHeight, standDepth);
    const standBody = new THREE.Mesh(standBodyGeo, verifyMaterial(materials.darkWood, 'wood'));
    standBody.position.y = standHeight / 2;
    standBody.castShadow = true;
    tvStandGroup.add(standBody);

    // Ножки (низкие)
    const standLegHeight = 0.05;
    const standLegGeo = new THREE.BoxGeometry(standWidth * 0.9, standLegHeight, standDepth * 0.9);
    const standLeg = new THREE.Mesh(standLegGeo, verifyMaterial(materials.blackMetal, 'metallic'));
    standLeg.position.y = standLegHeight / 2;
    tvStandGroup.add(standLeg);

    tvStandGroup.position.set(0, furnitureBaseHeight, halfDepth - standDepth / 2 - wallOffset); // У передней стены
    roomGroup.add(tvStandGroup);

    // 6. Телевизор на тумбе
    const tvGroup = new THREE.Group();
    tvGroup.name = 'television_detailed';
    const tvScreenWidth = 1.4;
    const tvScreenHeight = 0.8;
    const tvThickness = 0.05;

    // Экран
    const screenGeo = new THREE.BoxGeometry(tvScreenWidth, tvScreenHeight, tvThickness * 0.5);
    const screen = new THREE.Mesh(screenGeo, verifyMaterial(materials.tv, 'blackMetal'));
    screen.position.z = tvThickness * 0.25;
    tvGroup.add(screen);

    // Рамка ТВ
    const frameGeo = new THREE.BoxGeometry(tvScreenWidth * 1.02, tvScreenHeight * 1.03, tvThickness);
    const frame = new THREE.Mesh(frameGeo, verifyMaterial(materials.blackMetal, 'metallic'));
    frame.position.z = 0;
    tvGroup.add(frame);

    // Подставка ТВ
    const tvBaseWidth = 0.5;
    const tvBaseHeight = 0.05;
    const tvBaseDepth = 0.25;
    const tvBaseGeo = new THREE.BoxGeometry(tvBaseWidth, tvBaseHeight, tvBaseDepth);
    const tvBase = new THREE.Mesh(tvBaseGeo, verifyMaterial(materials.blackMetal, 'metallic'));
    tvBase.position.y = -tvScreenHeight / 2 - tvBaseHeight / 2;
    tvGroup.add(tvBase);

    tvGroup.position.set(
        tvStandGroup.position.x,
        tvStandGroup.position.y + standHeight + tvScreenHeight / 2 + tvBaseHeight, // Над тумбой
        tvStandGroup.position.z
    );
    tvGroup.castShadow = true;
    roomGroup.add(tvGroup);
    DEBUG.logFurniture('Detailed TV added', tvGroup);

  } catch (error) {
    console.error('Error in addLivingRoomFurniture:', error);
  }
};

const addKitchenFurniture = (roomGroup: THREE.Group, size: THREE.Vector3) => {
  DEBUG.logFurniture('Creating detailed kitchen furniture', roomGroup);

  try {
    const halfWidth = size.x / 2;
    const halfDepth = size.z / 2;
    const floorY = -size.y / 2;
    const wallOffset = 0.05;
    const furnitureBaseHeight = floorY + 0.05; // Кухонная мебель обычно стоит на цоколе

    // 1. Пол (плитка)
    const roomFloor = roomFloors.get(roomGroup.userData.roomId as string);
    if (roomFloor) {
      roomFloor.material = verifyMaterial(materials.floorTile, 'floor');
      DEBUG.logFurniture('Kitchen floor updated to tile', roomFloor);
    }

    // 2. Кухонный гарнитур (L-образный)
    const kitchenSetGroup = new THREE.Group();
    kitchenSetGroup.name = 'kitchen_set_detailed';
    const cabinetDepth = 0.6;
    const lowerCabinetHeight = 0.85;
    const upperCabinetHeight = 0.7;
    const upperCabinetDepth = 0.35;
    const countertopHeight = 0.04;
    const cabinetMat = verifyMaterial(materials.whiteWood, 'wood'); // Белые шкафы
    const handleMat = verifyMaterial(materials.blackMetal, 'metallic'); // Черные ручки

    // Функция создания ручки
    const createHandle = () => {
      const handleGeo = new THREE.BoxGeometry(0.02, 0.15, 0.02);
      const handle = new THREE.Mesh(handleGeo, handleMat);
      return handle;
    };

    // Нижние шкафы вдоль задней стены (north)
    const backWallLength = size.x * 0.9; // Почти вся стена
    const lowerBackCabinetGeo = new THREE.BoxGeometry(backWallLength, lowerCabinetHeight, cabinetDepth);
    const lowerBackCabinet = new THREE.Mesh(lowerBackCabinetGeo, cabinetMat);
    lowerBackCabinet.position.set(0, lowerCabinetHeight / 2, -halfDepth + cabinetDepth / 2 + wallOffset);
    lowerBackCabinet.castShadow = true;
    kitchenSetGroup.add(lowerBackCabinet);

    // Нижние шкафы вдоль боковой стены (west)
    const sideWallLength = size.z * 0.6; // Часть стены
    const lowerSideCabinetGeo = new THREE.BoxGeometry(cabinetDepth, lowerCabinetHeight, sideWallLength); // Ширина=глубина
    const lowerSideCabinet = new THREE.Mesh(lowerSideCabinetGeo, cabinetMat);
    lowerSideCabinet.position.set(-halfWidth + cabinetDepth / 2 + wallOffset, lowerCabinetHeight / 2, -cabinetDepth - sideWallLength / 2); // Смещено назад от угла
    lowerSideCabinet.castShadow = true;
    kitchenSetGroup.add(lowerSideCabinet);

    // Столешница (мрамор)
    const counterMat = verifyMaterial(materials.countertopMarble, 'metallic');
    const counterBackGeo = new THREE.BoxGeometry(backWallLength, countertopHeight, cabinetDepth);
    const counterBack = new THREE.Mesh(counterBackGeo, counterMat);
    counterBack.position.set(lowerBackCabinet.position.x, lowerCabinetHeight + countertopHeight / 2, lowerBackCabinet.position.z);
    counterBack.castShadow = true;
    kitchenSetGroup.add(counterBack);

    const counterSideGeo = new THREE.BoxGeometry(cabinetDepth, countertopHeight, sideWallLength);
    const counterSide = new THREE.Mesh(counterSideGeo, counterMat);
    counterSide.position.set(lowerSideCabinet.position.x, lowerCabinetHeight + countertopHeight / 2, lowerSideCabinet.position.z);
    counterSide.castShadow = true;
    kitchenSetGroup.add(counterSide);

    // Верхние шкафы (над нижними задними)
    const upperBackCabinetGeo = new THREE.BoxGeometry(backWallLength * 0.9, upperCabinetHeight, upperCabinetDepth); // Чуть короче
    const upperBackCabinet = new THREE.Mesh(upperBackCabinetGeo, cabinetMat);
    const upperY = lowerCabinetHeight + countertopHeight + 0.5 + upperCabinetHeight / 2; // Пространство над столешницей
    upperBackCabinet.position.set(lowerBackCabinet.position.x, upperY, -halfDepth + upperCabinetDepth / 2 + wallOffset);
    upperBackCabinet.castShadow = true;
    kitchenSetGroup.add(upperBackCabinet);

    // Ручки (примерное размещение)
    const handleBack = createHandle();
    handleBack.position.set(backWallLength * 0.3, lowerCabinetHeight * 0.8, lowerBackCabinet.position.z + cabinetDepth / 2 + 0.01);
    kitchenSetGroup.add(handleBack);
    const handleSide = createHandle();
    handleSide.rotation.z = Math.PI / 2;
    handleSide.position.set(lowerSideCabinet.position.x + cabinetDepth / 2 + 0.01, lowerCabinetHeight * 0.8, lowerSideCabinet.position.z + sideWallLength * 0.3);
    kitchenSetGroup.add(handleSide);
    const handleUpper = createHandle();
    handleUpper.position.set(backWallLength * 0.3, upperBackCabinet.position.y + upperCabinetHeight * 0.3, upperBackCabinet.position.z + upperCabinetDepth / 2 + 0.01);
    kitchenSetGroup.add(handleUpper);

    // Мойка (простой бокс)
    const sinkWidth = 0.6;
    const sinkDepth = 0.4;
    const sinkHeight = 0.15; // Глубина мойки
    const sinkGeo = new THREE.BoxGeometry(sinkWidth, countertopHeight, sinkDepth);
    const sink = new THREE.Mesh(sinkGeo, verifyMaterial(materials.sinkMetal, 'metallic'));
    // Размещаем на боковой столешнице
    sink.position.set(
      counterSide.position.x,
      counterSide.position.y + countertopHeight / 2 - sinkHeight / 2, // Утоплена
      counterSide.position.z
    );
    kitchenSetGroup.add(sink);

    kitchenSetGroup.position.y = furnitureBaseHeight;
    roomGroup.add(kitchenSetGroup);
    DEBUG.logFurniture('Kitchen set added', kitchenSetGroup);

    // 3. Холодильник (высокий шкаф)
    const fridgeWidth = 0.7;
    const fridgeDepth = 0.7;
    const fridgeHeight = 1.8;
    const fridgeGeo = new THREE.BoxGeometry(fridgeWidth, fridgeHeight, fridgeDepth);
    const fridge = new THREE.Mesh(fridgeGeo, verifyMaterial(materials.whiteWood, 'metallic')); // Белый или металлик
    fridge.position.set(halfWidth - fridgeWidth / 2 - wallOffset, furnitureBaseHeight + fridgeHeight / 2, -halfDepth + fridgeDepth / 2 + wallOffset); // В другом углу
    fridge.castShadow = true;
    roomGroup.add(fridge);
    DEBUG.logFurniture('Fridge added', fridge);

    // 4. Обеденный стол
    const tableGroup = new THREE.Group();
    tableGroup.name = 'dining_table_detailed';
    const tableRadius = 0.6; // Круглый стол
    const tableTopHeight = 0.04;
    const tableLegHeight = 0.7;

    // Столешница (круглая)
    const tableTopGeo = new THREE.CylinderGeometry(tableRadius, tableRadius, tableTopHeight, 32);
    const tableTop = new THREE.Mesh(tableTopGeo, verifyMaterial(materials.darkWood, 'wood'));
    tableTop.position.y = tableLegHeight + tableTopHeight / 2;
    tableTop.castShadow = true;
    tableGroup.add(tableTop);

    // Центральная ножка стола
    const tableLegRadius = 0.1;
    const tableLegGeo = new THREE.CylinderGeometry(tableLegRadius, tableLegRadius * 1.5, tableLegHeight, 16); // Расширяется книзу
    const tableLeg = new THREE.Mesh(tableLegGeo, verifyMaterial(materials.darkWood, 'wood'));
    tableLeg.position.y = tableLegHeight / 2;
    tableLeg.castShadow = true;
    tableGroup.add(tableLeg);

    tableGroup.position.set(0, furnitureBaseHeight, halfDepth - tableRadius - 1.0); // В свободной зоне
    roomGroup.add(tableGroup);
    DEBUG.logFurniture('Dining table added', tableGroup);

    // 5. Стулья (2 шт, простые)
    const createChair = (angle: number) => {
      const chairGroup = new THREE.Group();
      const seatSize = 0.4;
      const seatHeight = 0.04;
      const legHeight = 0.4;
      const backHeight = 0.5;

      // Сиденье
      const seatGeo = new THREE.BoxGeometry(seatSize, seatHeight, seatSize);
      const seatMat = verifyMaterial(materials.darkWood, 'wood');
      const seat = new THREE.Mesh(seatGeo, seatMat);
      seat.position.y = legHeight + seatHeight / 2;
      seat.castShadow = true;
      chairGroup.add(seat);

      // Ножки
      const legSize = 0.03;
      const legGeo = new THREE.BoxGeometry(legSize, legHeight, legSize);
      const legPositions = [
        { x: -seatSize / 2 * 0.8, z: -seatSize / 2 * 0.8 },
        { x: seatSize / 2 * 0.8, z: -seatSize / 2 * 0.8 },
        { x: -seatSize / 2 * 0.8, z: seatSize / 2 * 0.8 },
        { x: seatSize / 2 * 0.8, z: seatSize / 2 * 0.8 },
      ];
      legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeo, seatMat);
        leg.position.set(pos.x, legHeight / 2, pos.z);
        leg.castShadow = true;
        chairGroup.add(leg);
      });

      // Спинка
      const backGeo = new THREE.BoxGeometry(seatSize, backHeight, 0.03);
      const back = new THREE.Mesh(backGeo, seatMat);
      back.position.set(0, legHeight + seatHeight + backHeight / 2, -seatSize / 2 + 0.015);
      back.castShadow = true;
      chairGroup.add(back);

      // Позиционирование стула вокруг стола
      const distanceFromTable = tableRadius + 0.4;
      chairGroup.position.set(
        tableGroup.position.x + Math.cos(angle) * distanceFromTable,
        furnitureBaseHeight,
        tableGroup.position.z + Math.sin(angle) * distanceFromTable
      );
      chairGroup.lookAt(tableGroup.position.x, furnitureBaseHeight, tableGroup.position.z); // Повернуть к столу

      return chairGroup;
    };

    const chair1 = createChair(Math.PI / 4); // Примерные углы
    roomGroup.add(chair1);
    const chair2 = createChair(-Math.PI / 4);
    roomGroup.add(chair2);
    DEBUG.logFurniture('Chairs added', chair1);


  } catch (error) {
    console.error('Error in addKitchenFurniture:', error);
  }
};

// Calculate positions for devices in room
const calculateDevicePositions = (deviceCount: number, roomSize: THREE.Vector3): THREE.Vector3[] => {
  const positions: THREE.Vector3[] = [];
  const halfWidth = roomSize.x / 2 - 0.5;  // margin from walls
  const halfDepth = roomSize.z / 2 - 0.5;  // margin from walls
  
  // For a single central fixture
  if (deviceCount === 1) {
    positions.push(new THREE.Vector3(0, 0, 0));
    return positions;
  }
  
  // For multiple devices, distribute across room
  const cols = Math.ceil(Math.sqrt(deviceCount));
  const rows = Math.ceil(deviceCount / cols);
  
  const stepX = roomSize.x / cols;
  const stepZ = roomSize.z / rows;
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const index = i * cols + j;
      if (index < deviceCount) {
        const x = -halfWidth + stepX * (j + 0.5);
        const z = -halfDepth + stepZ * (i + 0.5);
        positions.push(new THREE.Vector3(x, 0, z));
      }
    }
  }
  
  return positions;
};

// Create light fixture
const createLightFixture = (
  roomGroup: THREE.Group,
  device: any,
  position: THREE.Vector3
) => {
  // Create light group
  const lightGroup = new THREE.Group();
  lightGroup.position.copy(position);
  lightGroup.userData = { deviceId: device.id, type: 'light' };
  roomGroup.add(lightGroup);
  
  // Ceiling mount
  const fixtureGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 16);
  const fixtureMaterial = new THREE.MeshStandardMaterial({ color: 0x424242 });
  const fixture = new THREE.Mesh(fixtureGeometry, fixtureMaterial);
  fixture.position.y = 0;
  lightGroup.add(fixture);
  
  // Lamp shade
  const lampShadeGeometry = new THREE.ConeGeometry(0.3, 0.4, 16, 1, true);
  const lampShadeMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xeeeeee,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  });
  const lampShade = new THREE.Mesh(lampShadeGeometry, lampShadeMaterial);
  lampShade.position.y = -0.3;
  lampShade.rotation.x = Math.PI; // flip cone
  lightGroup.add(lampShade);
  
  // Light bulb
  const bulbGeometry = new THREE.SphereGeometry(0.1, 16, 16);
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: device.isOn ? 0xffff00 : 0x888888,
    emissive: device.isOn ? 0xffff00 : 0x000000,
    emissiveIntensity: device.isOn ? 0.5 : 0
  });
  const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
  bulb.position.y = -0.35;
  bulb.name = 'bulb'; // Add name for easy lookup
  lightGroup.add(bulb);
  
  // Add light source if device is on
  if (device.isOn) {
    const pointLight = new THREE.PointLight(0xffff99, 0.8, 10);
    pointLight.position.copy(bulb.position);
    lightGroup.add(pointLight);
    roomLights.set(device.id, pointLight);
  }
  
  // Save reference to device
  roomDevices.set(device.id, lightGroup);
};

// Create fan
const createFan = (
  roomGroup: THREE.Group,
  device: any,
  position: THREE.Vector3
) => {
  // Create fan group
  const fanGroup = new THREE.Group();
  fanGroup.position.copy(position);
  fanGroup.userData = { deviceId: device.id, type: 'fan' };
  roomGroup.add(fanGroup);
  
  // Ceiling mount
  const mountGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.3, 16);
  const mountMaterial = new THREE.MeshStandardMaterial({ color: 0x424242 });
  const mount = new THREE.Mesh(mountGeometry, mountMaterial);
  fanGroup.add(mount);
  
  // Fan body
  const bodyGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x757575 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = -0.2;
  fanGroup.add(body);
  
  // Create blade group for rotation animation
  const bladesGroup = new THREE.Group();
  bladesGroup.position.y = -0.25;
  fanGroup.add(bladesGroup);
  
  // Fan blades
  const bladeGeometry = new THREE.BoxGeometry(0.6, 0.02, 0.1);
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade.rotation.y = (Math.PI * 2 / 3) * i;
    blade.castShadow = true;
    bladesGroup.add(blade);
  }
  
  // Save references
  roomDevices.set(device.id, fanGroup);
  roomFans.set(device.id, bladesGroup);
};

// Create thermostat - продолжение
const createThermostat = (
  roomGroup: THREE.Group,
  device: any,
  position: THREE.Vector3
) => {
  // Create thermostat group
  const thermostatGroup = new THREE.Group();
  thermostatGroup.position.copy(position);
  thermostatGroup.userData = { deviceId: device.id, type: 'thermostat' };
  roomGroup.add(thermostatGroup);
  
  // Thermostat body
  const bodyGeometry = new THREE.BoxGeometry(0.15, 0.2, 0.05);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  thermostatGroup.add(body);
  
  // Thermostat screen - яркий и заметный для отладки
  const screenGeometry = new THREE.PlaneGeometry(0.1, 0.1);
  const screenMaterial = new THREE.MeshStandardMaterial({ 
    color: USE_BRIGHT_COLORS ? 0x4CAF50 : 0x0d47a1,
    emissive: USE_BRIGHT_COLORS ? 0x4CAF50 : 0x0d47a1,
    emissiveIntensity: USE_BRIGHT_COLORS ? 0.5 : 0.2,
    roughness: 0.5,  // Добавлены параметры для MeshStandardMaterial
    metalness: 0.2
  });
  const screen = new THREE.Mesh(screenGeometry, screenMaterial);
  screen.position.z = 0.026;
  thermostatGroup.add(screen);
  
  // Thermostat buttons
  const buttonGeometry = new THREE.BoxGeometry(0.03, 0.03, 0.01);
  const buttonMaterial = new THREE.MeshStandardMaterial({ color: 0x757575 });
  
  const buttonUp = new THREE.Mesh(buttonGeometry, buttonMaterial);
  buttonUp.position.set(0.05, 0.05, 0.03);
  thermostatGroup.add(buttonUp);
  
  const buttonDown = new THREE.Mesh(buttonGeometry, buttonMaterial);
  buttonDown.position.set(0.05, -0.05, 0.03);
  thermostatGroup.add(buttonDown);
  
  // Save reference
  roomDevices.set(device.id, thermostatGroup);
};

// Mouse click handler
const onMouseClick = (event: MouseEvent) => {
  if (!sceneContainer.value) return;
  
  // Calculate mouse position in normalized device coordinates
  const rect = sceneContainer.value.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / sceneContainer.value.clientWidth) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / sceneContainer.value.clientHeight) * 2 + 1;
  
  // Update picking ray with camera and mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Get all intersected objects, including those behind the roof
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  // Define a list of roof objects to filter them out for interaction
  const roofObjects: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.type === 'roof') {
      roofObjects.push(obj);
    }
  });
  
  // Filter out roof objects from intersections
  const nonRoofIntersects = intersects.filter(intersect => {
    // Check the object and all its parents to ensure it's not a roof
    let currentObj = intersect.object;
    while (currentObj) {
      if (currentObj.userData && currentObj.userData.type === 'roof') {
        return false;
      }
      currentObj = currentObj.parent!;
    }
    return true;
  });
  
  // Process the first non-roof intersection
  if (nonRoofIntersects.length > 0) {
    // Find first object with userData
    let currentObj: THREE.Object3D | null = nonRoofIntersects[0].object;
    let userData: any = null;
    
    // Traverse up hierarchy to find object with userData
    while (currentObj && !userData) {
      if (currentObj.userData && (currentObj.userData.deviceId || currentObj.userData.roomId)) {
        userData = currentObj.userData;
        break;
      }
      currentObj = currentObj.parent;
    }
    
    if (!userData) return;
    
    // Handle based on object type
    if (userData.type === 'light') {
      // Toggle light
      const device = houseStore.getDeviceById(userData.deviceId);
      if (device) {
        houseStore.toggleDevice(userData.deviceId);
        
        // Update light object
        // ... existing light update code ...
      }
    } else if (userData.type === 'fan') {
      // Toggle fan
      const device = houseStore.getDeviceById(userData.deviceId);
      if (device) {
        houseStore.toggleDevice(userData.deviceId);
        
        // Send notification
        const actionText = device.isOn ? 'включен' : 'выключен';
        notificationStore.addInfo(`${device.name} ${actionText}`);
      }
    } else if (userData.type === 'room') {
      // Select room in the store
      houseStore.selectRoom(userData.roomId);
    }
  }
};

// Watch for changes in the selected room
watch(
  () => houseStore.selectedRoomId,
  (newSelectedRoomId) => {
    highlightSelectedRoom(newSelectedRoomId);
  }
);

// Function to highlight the selected room
const highlightSelectedRoom = (roomId: string | null) => {
  // First, remove highlight from all rooms
  roomWalls.forEach((walls, id) => {
    walls.forEach(wall => {
      wall.material = materials.wall;
    });
  });
  
  // If a room is selected, highlight it
  if (roomId) {
    const walls = roomWalls.get(roomId);
    if (walls) {
      walls.forEach(wall => {
        wall.material = materials.wallSelected;
      });
      
      // Раскомментировать, чтобы камера перемещалась к выбранной комнате
      // const roomMesh = roomMeshes.get(roomId);
      // if (roomMesh) {
      //   new TWEEN.Tween(camera.position)
      //     .to({
      //       x: roomMesh.position.x,
      //       y: camera.position.y,
      //       z: roomMesh.position.z + 5 // Position camera slightly away from the room
      //     }, 1000)
      //     .easing(TWEEN.Easing.Cubic.InOut)
      //     .start();
        
      //   new TWEEN.Tween(controls.target)
      //     .to({
      //       x: roomMesh.position.x,
      //       y: roomMesh.position.y,
      //       z: roomMesh.position.z
      //     }, 1000)
      //     .easing(TWEEN.Easing.Cubic.InOut)
      //     .start();
      // }
    }
  }
};

// Setup drag and drop
const setupDragAndDrop = () => {
  if (!sceneContainer.value) return;
  
  // Dragover handler
  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    
    // Highlight room on dragover
    highlightRoomOnDragOver(event);
  };
  
  // Drop handler
  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    
    if (!event.dataTransfer) return;
    
    const deviceType = event.dataTransfer.getData('application/device');
    if (!deviceType) return;
    
    const roomId = getRoomAtPosition(event);
    if (!roomId) return;
    
    // Clear room highlights
    clearRoomHighlights();
    
    // Dispatch event that device was dropped in room
    window.dispatchEvent(new CustomEvent('device-dropped', { 
      detail: { deviceType, roomId } 
    }));
  };
  
  // Dragend handler
  const handleDragEnd = () => {
    // Clear room highlights
    clearRoomHighlights();
    
    // Dispatch event that drag ended
    window.dispatchEvent(new CustomEvent('device-drag-end'));
  };
  
  // Setup handlers
  sceneContainer.value.addEventListener('dragover', handleDragOver);
  sceneContainer.value.addEventListener('drop', handleDrop);
  sceneContainer.value.addEventListener('dragleave', clearRoomHighlights);
  document.addEventListener('dragend', handleDragEnd);
};

// Highlight room on dragover
const highlightRoomOnDragOver = (event: DragEvent) => {
  // Clear current highlight
  clearRoomHighlights();
  
  // Get room under cursor
  const roomId = getRoomAtPosition(event);
  if (!roomId) return;
  
  // Highlight room
  const roomWallsArray = roomWalls.get(roomId);
  if (roomWallsArray) {
    roomWallsArray.forEach(wall => {
      // Save original material if not already saved
      if (!wall.userData.originalMaterial) {
        wall.userData.originalMaterial = wall.material;
      }
      
      // Apply highlight material
      wall.material = materials.wallSelected;
    });
  }
};

// Clear all room highlights
const clearRoomHighlights = () => {
  roomWalls.forEach(walls => {
    walls.forEach(wall => {
      if (wall.userData.originalMaterial) {
        wall.material = wall.userData.originalMaterial;
        delete wall.userData.originalMaterial;
      } else {
        wall.material = materials.wall;
      }
    });
  });
};

// Get room at mouse position
const getRoomAtPosition = (event: MouseEvent | DragEvent): string | null => {
  if (!sceneContainer.value) return null;
  
  const rect = sceneContainer.value.getBoundingClientRect();
  
  // Calculate mouse coordinates
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  // Find first room in intersections
  for (const intersect of intersects) {
    let obj = intersect.object;
    
    // Check if object has roomId
    if (obj.userData?.roomId) {
      return obj.userData.roomId;
    }
    
    // Check parents
    let parent = obj.parent;
    while (parent) {
      if (parent.userData?.roomId) {
        return parent.userData.roomId;
      }
      parent = parent.parent;
    }
  }
  
  return null;
};

// Window resize handler
const onWindowResize = () => {
  if (!sceneContainer.value) return;
  
  let width = sceneContainer.value.clientWidth;
  const height = sceneContainer.value.clientHeight;
  
  // Проверка на нулевую ширину
  if (width === 0) {
    console.warn('Resize: Container width is zero, forcing minimum width');
    const parentWidth = sceneContainer.value.parentElement?.clientWidth || 300;
    width = Math.max(parentWidth, 300);
    sceneContainer.value.style.width = `${width}px`;
  }
  
  console.log('Resizing to:', width, height);
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
};

// Animation loop
const animate = () => {
  animationFrameId = requestAnimationFrame(animate);
  
  // Update TWEEN для анимации камеры
  TWEEN.update();
  
  // Update stats
  stats.update();
  fpsValue.value = Math.round((stats as any).fps).toString();
  
  // Animate fans
  roomFans.forEach((fan, deviceId) => {
    const device = houseStore.getDeviceById(deviceId);
    if (device?.isOn) {
      fan.rotation.y += 0.05 * (device.type === 'fan' ? (device as any).speed / 100 : 1);
    }
  });
  
  // Animation for overload warning
  if (houseStore.isOverloaded) {
    roomLights.forEach((light) => {
      if (Math.random() > 0.7) {
        light.intensity = Math.random() * 1.5;
      }
    });
  } else {
    roomLights.forEach((light) => {
      light.intensity = 0.8;
    });
  }
  
  // Update controls
  controls.update();
  
  // Render scene
  renderer.render(scene, camera);
};

// Clean up resources
const cleanupResources = () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  if (hintTimerId) {
    clearTimeout(hintTimerId);
    hintTimerId = null;
  }
  
  // Отключаем ResizeObserver если он есть
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  
  if (sceneContainer.value) {
    // Remove event listeners
    sceneContainer.value.removeEventListener('click', onMouseClick);
    
    // Remove renderer from DOM if it exists
    const rendererElement = sceneContainer.value.querySelector('canvas');
    if (rendererElement) {
      sceneContainer.value.removeChild(rendererElement);
    }
    
    // Remove stats element if it exists
    const statsElement = sceneContainer.value.querySelector('.stats');
    if (statsElement) {
      sceneContainer.value.removeChild(statsElement);
    }
  }
  
  // Remove window event listeners
  window.removeEventListener('resize', onWindowResize);
  
  // Clear collections
  roomMeshes.clear();
  roomWalls.clear();
  roomFloors.clear();
  roomLights.clear();
  roomFans.clear();
  roomDevices.clear();
};

// Update object counts for stats
const updateObjectCounts = () => {
  if (!scene) return;
  
  let count = 0;
  scene.traverse((object) => {
    count++;
  });
  
  objectsCount.value = count;
};

// Lifecycle hooks
onMounted(() => {
  // Initialize 3D scene on component mount
  initScene();
  
  // Добавляем ResizeObserver для более надежного отслеживания изменений размера
  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === sceneContainer.value) {
          console.log('ResizeObserver:', entry.contentRect.width, entry.contentRect.height);
          
          // Проверяем, нужно ли вызывать onWindowResize
          if (entry.contentRect.width > 0) {
            onWindowResize();
          } else if (entry.contentRect.width === 0 && sceneContainer.value) {
            // Исправляем нулевую ширину
            const parentWidth = sceneContainer.value.parentElement?.clientWidth || 300;
            const width = Math.max(parentWidth, 300);
            sceneContainer.value.style.width = `${width}px`;
            
            // Вызываем обновление размеров с задержкой
            setTimeout(() => {
              onWindowResize();
            }, 100);
          }
        }
      }
    });

    if (sceneContainer.value) {
      resizeObserver.observe(sceneContainer.value);
    }
  }
  
  // Еще один хак для исправления нулевой ширины - проверяем через секунду после монтирования
  setTimeout(() => {
    if (sceneContainer.value && sceneContainer.value.clientWidth === 0) {
      console.log('Delayed check: container still has zero width, forcing minimum width');
      const parentWidth = sceneContainer.value.parentElement?.clientWidth || 300;
      sceneContainer.value.style.width = `${parentWidth}px`;
      onWindowResize();
    }
  }, 1000);
});

onBeforeUnmount(() => {
  cleanupResources();
});
</script>

<style scoped>
.scene-container {
  position: relative;
  width: 100%; /* Явно задаем ширину */
  min-width: 800px; /* Устанавливаем минимальную ширину */
  height: 100%;
  overflow: hidden;
  background: linear-gradient(to bottom, #bbdefb, #e3f2fd);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.scene-loading {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.8);
  z-index: 10;
  backdrop-filter: blur(5px);
}

.scene-error {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: rgba(255, 0, 0, 0.1);
  color: #d32f2f;
  z-index: 10;
  text-align: center;
  padding: 20px;
}

.scene-error button {
  margin-top: 15px;
  padding: 8px 16px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid rgba(33, 150, 243, 0.2);
  border-radius: 50%;
  border-top-color: #2196f3;
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 20px;
}

.controls-hint {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(255, 255, 255, 0.8);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  color: #455a64;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 5;
}

.controls-hint.visible {
  opacity: 1;
}

.scene-stats {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  z-index: 5;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.stat-label {
  margin-right: 10px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>