<template>
  <div ref="sceneContainer" class="scene-container">
    <div class="loading" v-if="isLoading">
      <div class="spinner"></div>
      <p>Загрузка 3D сцены...</p>
    </div>
    
    <div class="controls-hint" v-if="!isLoading">
      <p>Используйте мышь для вращения камеры, колесико для масштабирования</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide } from 'vue';
import * as THREE from 'three';
import { useHouseStore } from '../stores/house';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useNotificationStore } from '../stores/notification';

// Stores
const houseStore = useHouseStore();
const notificationStore = useNotificationStore();

// Refs
const sceneContainer = ref<HTMLElement | null>(null);
const isLoading = ref(true);

// Three.js variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let raycaster: THREE.Raycaster;
let mouse: THREE.Vector2;

// Room meshes and interactive objects
const roomMeshes: Map<string, THREE.Group> = new Map();
const roomWalls: Map<string, THREE.Mesh[]> = new Map();
const roomFloors: Map<string, THREE.Mesh> = new Map();
const roomLights: Map<string, THREE.Light> = new Map();
const roomFans: Map<string, THREE.Group> = new Map();
const roomDevices: Map<string, THREE.Object3D> = new Map();

// Materials library
const materials = {
  // Полы
  floor: new THREE.MeshStandardMaterial({ 
    color: 0xd7ccc8, 
    roughness: 0.9,
    metalness: 0.1
  }),
  // Крыша
  roof: new THREE.MeshStandardMaterial({ 
    color: 0x795548, 
    roughness: 0.7,
    metalness: 0.3
  }),
  // Рамы окон и дверей
  frame: new THREE.MeshStandardMaterial({ 
    color: 0x8d6e63, 
    roughness: 0.5,
    metalness: 0.5
  }),
  // Стекло
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0,
    metalness: 0,
    transparent: true,
    opacity: 0.3,
    transmission: 0.9,
  }),
  // Для внешней территории
  ground: new THREE.MeshStandardMaterial({ 
    color: 0x7cb342, 
    roughness: 1,
    metalness: 0
  }),
  wall: new THREE.MeshStandardMaterial({ 
    color: 0xf5f5f5, 
    roughness: 0.8,
    metalness: 0.2,
  }),
  wallSelected: new THREE.MeshStandardMaterial({ 
    color: 0xe1f5fe,
    roughness: 0.8,
    metalness: 0.2, 
  }),
  // Материалы для пола
  floorWood: new THREE.MeshStandardMaterial({ 
    color: 0xCD9575, // Теплый дуб для гостиной
    roughness: 0.9,
    metalness: 0.1
  }),
  floorTile: new THREE.MeshStandardMaterial({ 
    color: 0xE5E4E2, // Светлая плитка для кухни
    roughness: 0.8,
    metalness: 0.2
  }),
  floorCarpet: new THREE.MeshStandardMaterial({ 
    color: 0xB6B6B4, // Мягкий ковер для спальни
    roughness: 0.95,
    metalness: 0.05
  }),
  
  // Материалы для мебели
  sofa: new THREE.MeshStandardMaterial({ 
    color: 0x6082B6, // Синий диван
    roughness: 0.8,
    metalness: 0.1
  }),
  wood: new THREE.MeshStandardMaterial({ 
    color: 0x8B4513, // Темное дерево
    roughness: 0.7,
    metalness: 0.2
  }),
  metallic: new THREE.MeshStandardMaterial({ 
    color: 0xC0C0C0, // Серебристый металл
    roughness: 0.3,
    metalness: 0.8
  }),
  fabric: new THREE.MeshStandardMaterial({ 
    color: 0xEDC9AF, // Мягкая ткань
    roughness: 0.9,
    metalness: 0.1
  }),
  kitchenCounter: new THREE.MeshStandardMaterial({ 
    color: 0xF5F5F5, // Светлая столешница
    roughness: 0.5,
    metalness: 0.3
  }),
  bedding: new THREE.MeshStandardMaterial({ 
    color: 0xE0FFFF, // Светло-голубое белье
    roughness: 0.8,
    metalness: 0.1
  }),
  carpet: new THREE.MeshStandardMaterial({
    color: 0xBC8F8F, // Розовато-коричневый ковер
    roughness: 0.95,
    metalness: 0.05
  }),
  tv: new THREE.MeshStandardMaterial({
    color: 0x000000, // Черный экран телевизора
    roughness: 0.1,
    metalness: 0.6,
    emissive: 0x333333, // Легкое свечение
    emissiveIntensity: 0.2
  }),
  fridge: new THREE.MeshStandardMaterial({
    color: 0xFFFFFF, // Белый холодильник
    roughness: 0.3,
    metalness: 0.7
  })
};

// Цвета для разных типов комнат
const roomColors = {
  living: 0xe8f5e9,   // светло-зеленый для гостиной
  bedroom: 0xe1f5fe,  // светло-голубой для спальни
  kitchen: 0xfff3e0,  // светло-оранжевый для кухни
  bathroom: 0xe0f7fa, // светло-бирюзовый для ванной
  default: 0xf5f5f5   // по умолчанию белый
};

// Animation
let animationFrameId: number;
let hintTimerId: number;

// Interaction handling
const onMouseClick = (event: MouseEvent) => {
  if (!sceneContainer.value) return;
  
  // Calculate mouse position in normalized device coordinates
  const rect = sceneContainer.value.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / sceneContainer.value.clientWidth) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / sceneContainer.value.clientHeight) * 2 + 1;
  
  // Update the picking ray with the camera and mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Calculate objects intersecting the picking ray
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  if (intersects.length > 0) {
    // Find the first object with userData
    const intersectedObject = intersects[0].object;
    
    // Проходим вверх по иерархии объектов, чтобы найти объект с userData
    let currentObj: THREE.Object3D | null = intersectedObject;
    let userData: any = null;
    
    while (currentObj && !userData) {
      if (currentObj.userData && (currentObj.userData.deviceId || currentObj.userData.roomId)) {
        userData = currentObj.userData;
        break;
      }
      currentObj = currentObj.parent;
    }
    
    if (!userData) return;
    
    if (userData.type === 'light') {
      // Toggle light
      const device = houseStore.getDeviceById(userData.deviceId);
      if (device) {
        houseStore.toggleDevice(userData.deviceId);

        // Update light point
        const lightObject = roomDevices.get(userData.deviceId);
        if (lightObject) {
          // Обновляем цвет лампочки
          const bulbMaterial = new THREE.MeshStandardMaterial({
            color: device.isOn ? 0xffff00 : 0x888888,
            emissive: device.isOn ? 0xffff00 : 0x000000,
            emissiveIntensity: device.isOn ? 0.5 : 0
          });
          
          if (lightObject instanceof THREE.Group) {
            // Находим лампочку в группе
            lightObject.children.forEach(child => {
              if (child.name === 'bulb') {
                (child as THREE.Mesh).material = bulbMaterial;
              }
            });
          }
          
          // Добавляем или удаляем точечный свет
          if (device.isOn) {
            if (!roomLights.has(device.id)) {
              const pointLight = new THREE.PointLight(0xffff99, 1, 10);
              pointLight.position.copy(lightObject.position);
              scene.add(pointLight);
              roomLights.set(device.id, pointLight);
            }
          } else {
            const light = roomLights.get(device.id);
            if (light) {
              scene.remove(light);
              roomLights.delete(device.id);
            }
          }
        }
        
        // Отправляем уведомление
        const actionText = device.isOn ? 'включен' : 'выключен';
        notificationStore.addInfo(`${device.name} ${actionText}`);      }
        
    } else if (userData.type === 'fan') {
      // Toggle fan
      const device = houseStore.getDeviceById(userData.deviceId);
      if (device) {
        houseStore.toggleDevice(userData.deviceId);
        
        // Отправляем уведомление
        const actionText = device.isOn ? 'включен' : 'выключен';
        notificationStore.addInfo(`${device.name} ${actionText}`);      }

    } else if (userData.type === 'room') {
      // Select room - highlight walls
      const room = houseStore.getRoomById(userData.roomId);
      if (room) {
        // Убираем выделение со всех комнат
        roomWalls.forEach((walls, roomId) => {
          walls.forEach(wall => {
            wall.material = materials.wall;
          });
        });
        
        // Выделяем выбранную комнату
        const walls = roomWalls.get(userData.roomId);
        if (walls) {
          walls.forEach(wall => {
            wall.material = materials.wallSelected;
          });
        }
        
        // Отправляем уведомление
        notificationStore.addInfo(`Выбрана комната: ${room.name}`);
      }
    }
  }
};

// Setup scene
const setupScene = () => {
  if (!sceneContainer.value) return;
  
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeceff1); // Светло-серый фон
  
  // Create camera
  const aspect = sceneContainer.value.clientWidth / sceneContainer.value.clientHeight;
  camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
  camera.position.set(20, 15, 20);
  camera.lookAt(0, 0, 0);
  
  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(sceneContainer.value.clientWidth, sceneContainer.value.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  sceneContainer.value.appendChild(renderer.domElement);
  
  // Create orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.1;  // Ограничиваем камеру, чтобы не смотреть под дом
  controls.minDistance = 5;
  controls.maxDistance = 50;
  
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
  
  // Add floor/ground
  createGround();
  
  // Build the house from store data
  buildHouse();
  
  // Add event listeners
  window.addEventListener('resize', onWindowResize);
  sceneContainer.value.addEventListener('click', onMouseClick);

  // Start animation
  animate();
  
  // Done loading
  isLoading.value = false;
  
  // Показываем подсказку на 5 секунд
  document.querySelector('.controls-hint')?.classList.add('visible');
  hintTimerId = window.setTimeout(() => {
    document.querySelector('.controls-hint')?.classList.remove('visible');
  }, 5000);
};

// Создание ландшафта вокруг дома
const createGround = () => {
  // Основная поверхность земли
  const groundGeometry = new THREE.PlaneGeometry(100, 100);
  const groundMaterial = materials.ground;
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);
  
  // Дорожка к дому
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
  
  // Добавляем несколько деревьев вокруг дома
  addTrees();
};

// Добавление деревьев на сцену
const addTrees = () => {
  // Создаем дерево (ствол + крона)
  const createTree = (x: number, z: number) => {
    const treeGroup = new THREE.Group();
    
    // Ствол
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 2, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x8d6e63, 
      roughness: 0.9 
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 1;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);
    
    // Крона
    const crownGeometry = new THREE.ConeGeometry(1.5, 3, 8);
    const crownMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x388e3c, 
      roughness: 0.8 
    });
    const crown = new THREE.Mesh(crownGeometry, crownMaterial);
    crown.position.y = 3.5;
    crown.castShadow = true;
    crown.receiveShadow = true;
    treeGroup.add(crown);
    
    // Позиционируем дерево
    treeGroup.position.set(x, 0, z);
    scene.add(treeGroup);
  };
  
  // Размещаем несколько деревьев
  createTree(-10, -15);
  createTree(-8, -10);
  createTree(12, -12);
  createTree(15, -8);
  createTree(-15, 5);
  createTree(18, 8);
};

// Build house from store data
const buildHouse = () => {
  const rooms = houseStore.rooms;
  
  // Создаем группу для всего дома
  const houseGroup = new THREE.Group();
  scene.add(houseGroup);
  
  // Рассчитываем размер дома на основе количества комнат
  const houseWidth = 15;  // общая ширина дома
  const houseDepth = 12;  // общая глубина дома
  const roomHeight = 3;   // высота комнат
  
  // Определяем размеры и позиции комнат
  const roomLayout: {
    id: string;
    position: THREE.Vector3;
    size: THREE.Vector3;
    doors: { to: string; wall: 'north' | 'east' | 'south' | 'west'; offset: number }[];
    windows: { wall: 'north' | 'east' | 'south' | 'west'; offset: number; width: number }[];
  }[] = [];
  
  // Размещаем гостиную в центре
  const livingRoom = rooms.find(r => r.type === 'living');
  if (livingRoom) {
    roomLayout.push({
      id: livingRoom.id,
      position: new THREE.Vector3(0, 0, 0),
      size: new THREE.Vector3(8, roomHeight, 7),
      doors: [
        { to: 'outside', wall: 'south', offset: 0 },  // входная дверь
      ],
      windows: [
        { wall: 'south', offset: -2.5, width: 1.5 },
        { wall: 'south', offset: 2.5, width: 1.5 },
      ]
    });
  }
  
  // Размещаем кухню слева от гостиной
  const kitchen = rooms.find(r => r.type === 'kitchen');
  if (kitchen) {
    roomLayout.push({
      id: kitchen.id,
      position: new THREE.Vector3(-6, 0, 0),
      size: new THREE.Vector3(4, roomHeight, 7),
      doors: [
        { to: livingRoom?.id || '', wall: 'east', offset: 0 }
      ],
      windows: [
        { wall: 'south', offset: 0, width: 1.5 },
        { wall: 'west', offset: 0, width: 1.5 },
      ]
    });
  }
  
  // Размещаем спальню справа от гостиной
  const bedroom = rooms.find(r => r.type === 'bedroom');
  if (bedroom) {
    roomLayout.push({
      id: bedroom.id,
      position: new THREE.Vector3(6, 0, 0),
      size: new THREE.Vector3(5, roomHeight, 7),
      doors: [
        { to: livingRoom?.id || '', wall: 'west', offset: -1 }
      ],
      windows: [
        { wall: 'south', offset: 0, width: 1.5 },
        { wall: 'east', offset: 0, width: 1.5 },
      ]
    });
  }
  
  // Размещаем ванную (если есть) за спальней
  const bathroom = rooms.find(r => r.type === 'bathroom');
  if (bathroom) {
    roomLayout.push({
      id: bathroom.id,
      position: new THREE.Vector3(6, 0, -5),
      size: new THREE.Vector3(5, roomHeight, 4),
      doors: [
        { to: bedroom?.id || '', wall: 'south', offset: -1 }
      ],
      windows: [
        { wall: 'north', offset: 0, width: 1 },
      ]
    });
  }
  
  // Создаем все комнаты по макету
  roomLayout.forEach(roomConfig => {
    createRoom(
      houseGroup,
      rooms.find(r => r.id === roomConfig.id),
      roomConfig.position,
      roomConfig.size,
      roomConfig.doors,
      roomConfig.windows
    );
  });
  
  // Добавляем крышу
  createRoof(houseGroup, houseWidth, houseDepth);
};

// Создание крыши
const createRoof = (houseGroup: THREE.Group, width: number, depth: number) => {
  const roofHeight = 4;  // высота крыши от верха стен
  
  // Создаем двускатную крышу
  const roofGeometry = new THREE.BufferGeometry();
  
  // Вершины крыши
  const vertices = new Float32Array([
    // Левый скат
    -width/2, 3, -depth/2,  // левый нижний задний
    -width/2, 3, depth/2,   // левый нижний передний
    0, 3 + roofHeight, -depth/2,  // верхний задний
    0, 3 + roofHeight, depth/2,   // верхний передний
    
    // Правый скат
    width/2, 3, -depth/2,   // правый нижний задний
    width/2, 3, depth/2,    // правый нижний передний
    0, 3 + roofHeight, -depth/2,  // верхний задний (повторяется)
    0, 3 + roofHeight, depth/2,   // верхний передний (повторяется)
  ]);
  
  // Индексы для треугольников
  const indices = [
    0, 2, 1,  // левый скат - треугольник 1
    1, 2, 3,  // левый скат - треугольник 2
    4, 5, 6,  // правый скат - треугольник 1
    5, 7, 6   // правый скат - треугольник 2
  ];
  
  // Нормали (для корректного освещения)
  const normals = new Float32Array([
    -0.5, 0.5, 0,  // левый скат - нижний задний
    -0.5, 0.5, 0,  // левый скат - нижний передний
    -0.5, 0.5, 0,  // левый скат - верхний задний
    -0.5, 0.5, 0,  // левый скат - верхний передний
    
    0.5, 0.5, 0,   // правый скат - нижний задний
    0.5, 0.5, 0,   // правый скат - нижний передний
    0.5, 0.5, 0,   // правый скат - верхний задний
    0.5, 0.5, 0    // правый скат - верхний передний
  ]);
  
  roofGeometry.setIndex(indices);
  roofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  roofGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  
  const roof = new THREE.Mesh(roofGeometry, materials.roof);
  roof.castShadow = true;
  houseGroup.add(roof);
  
  // Добавляем фронтоны
  // Передний фронтон
  const frontGableGeometry = new THREE.BufferGeometry();
  const frontGableVertices = new Float32Array([
    -width/2, 3, depth/2,           // нижний левый
    width/2, 3, depth/2,            // нижний правый
    0, 3 + roofHeight, depth/2      // верхний
  ]);
  frontGableGeometry.setAttribute('position', new THREE.BufferAttribute(frontGableVertices, 3));
  const frontGable = new THREE.Mesh(frontGableGeometry, materials.wall);
  frontGable.castShadow = true;
  houseGroup.add(frontGable);
  
  // Задний фронтон
  const backGableGeometry = new THREE.BufferGeometry();
  const backGableVertices = new Float32Array([
    -width/2, 3, -depth/2,          // нижний левый
    width/2, 3, -depth/2,           // нижний правый
    0, 3 + roofHeight, -depth/2     // верхний
  ]);
  backGableGeometry.setAttribute('position', new THREE.BufferAttribute(backGableVertices, 3));
  const backGable = new THREE.Mesh(backGableGeometry, materials.wall);
  backGable.castShadow = true;
  houseGroup.add(backGable);
};

// Create room with walls, floor, windows and doors
const createRoom = (
  houseGroup: THREE.Group,
  room: any, 
  position: THREE.Vector3, 
  size: THREE.Vector3,
  doors: { to: string; wall: 'north' | 'east' | 'south' | 'west'; offset: number }[],
  windows: { wall: 'north' | 'east' | 'south' | 'west'; offset: number; width: number }[]
) => {
  if (!room) return;
  
  // Создаем группу для комнаты (существующий код)
  const roomGroup = new THREE.Group();
  roomGroup.position.copy(position);
  roomGroup.userData = { roomId: room.id, type: 'room' };
  houseGroup.add(roomGroup);
  roomMeshes.set(room.id, roomGroup);
  
  // Определяем цвет комнаты в зависимости от типа (существующий код)
  const roomColor = roomColors[room.type as keyof typeof roomColors] || roomColors.default;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: roomColor,
    roughness: 0.8,
    metalness: 0.2
  });
  
  // Создаем массив стен комнаты (существующий код)
  const walls: THREE.Mesh[] = [];
  
  // Выбираем материал пола в зависимости от типа комнаты
 
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

    addCarpet(roomGroup, size, room.type);
}

// Создаем пол
const floorGeometry = new THREE.BoxGeometry(size.x, 0.1, size.z);
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.position.y = -size.y / 2;
floor.receiveShadow = true;
roomGroup.add(floor);
roomFloors.set(room.id, floor);
  
  // Helper function to create a wall
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
  
  // Создаем стены комнаты
  const wallThickness = 0.2;
  const halfWidth = size.x / 2;
  const halfDepth = size.z / 2;
  const halfHeight = size.y / 2;
  
  // Передняя стена (южная)
  const frontWall = createWall(size.x, size.y, wallThickness, 0, 0, halfDepth);
  frontWall.userData = { wall: 'south' };
  
  // Задняя стена (северная)
  const backWall = createWall(size.x, size.y, wallThickness, 0, 0, -halfDepth);
  backWall.userData = { wall: 'north' };
  
  // Левая стена (западная)
  const leftWall = createWall(size.z, size.y, wallThickness, -halfWidth, 0, 0, Math.PI / 2);
  leftWall.userData = { wall: 'west' };
  
  // Правая стена (восточная)
  const rightWall = createWall(size.z, size.y, wallThickness, halfWidth, 0, 0, Math.PI / 2);
  rightWall.userData = { wall: 'east' };
  
  // Добавляем стены в список для комнаты
  roomWalls.set(room.id, walls);
  
  // Добавляем двери и окна
  doors.forEach(door => {
    createDoor(roomGroup, door, size, wallThickness);
  });
  
  windows.forEach(window => {
    createWindow(roomGroup, window, size, wallThickness);
  });
  
  // Добавляем интерьер в зависимости от типа комнаты
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
  
  // Добавляем ковер в зависимости от типа комнаты
  addCarpet(roomGroup, size, room.type);
  
  // Добавляем устройства в комнату
  if (room.devices) {
    const devicesPositions = calculateDevicePositions(room.devices.length, size);
    
    room.devices.forEach((device: any, index: number) => {
      const devicePosition = devicesPositions[index % devicesPositions.length];
      
      if (device.type === 'light') {
        // Размещаем свет на потолке
        createLightFixture(
          roomGroup,
          device,
          new THREE.Vector3(devicePosition.x, halfHeight - 0.1, devicePosition.z)
        );
      } else if (device.type === 'fan') {
        // Размещаем вентилятор на потолке
        createFan(
          roomGroup,
          device,
          new THREE.Vector3(devicePosition.x, halfHeight - 0.3, devicePosition.z)
        );
      } else if (device.type === 'thermostat') {
        // Размещаем термостат на стене
        createThermostat(
          roomGroup,
          device,
          new THREE.Vector3(-halfWidth + 0.01, 0, -halfDepth + 1)
        );
      }
    });
  }
};

const addCarpet = (roomGroup: THREE.Group, size: THREE.Vector3, roomType: string) => {
  let carpetWidth, carpetLength, carpetColor;
  
  // Настройки ковра в зависимости от типа комнаты
  switch(roomType) {
    case 'living':
      carpetWidth = size.x * 0.7;
      carpetLength = size.z * 0.6;
      carpetColor = 0x8F8F8F; // Серый ковер для гостиной
      break;
    case 'bedroom':
      carpetWidth = size.x * 0.5;
      carpetLength = size.z * 0.5;
      carpetColor = 0xBC8F8F; // Розовато-коричневый для спальни
      break;
    case 'kitchen':
      carpetWidth = size.x * 0.4;
      carpetLength = size.z * 0.3;
      carpetColor = 0x6B8E23; // Оливковый для кухни
      break;
    default:
      carpetWidth = size.x * 0.6;
      carpetLength = size.z * 0.6;
      carpetColor = 0xA0A0A0; // Серый по умолчанию
  }
  
  // Создаем ковер
  const carpetGeometry = new THREE.BoxGeometry(carpetWidth, 0.03, carpetLength);
  const carpetMaterial = new THREE.MeshStandardMaterial({
    color: carpetColor,
    roughness: 0.9,
    metalness: 0.05
  });
  
  const carpet = new THREE.Mesh(carpetGeometry, carpetMaterial);
  
  // Размещаем ковер чуть выше пола
  carpet.position.y = -size.y / 2 + 0.05;
  carpet.receiveShadow = true;
  
  roomGroup.add(carpet);
};

// Функция для добавления мебели в гостиную
const addLivingRoomFurniture = (roomGroup: THREE.Group, size: THREE.Vector3) => {
  const halfWidth = size.x / 2;
  const halfDepth = size.z / 2;
  const floorY = -size.y / 2;
  
  // Создаем диван
  const sofaWidth = size.x * 0.5;
  const sofaDepth = size.z * 0.2;
  const sofaHeight = 0.7;
  
  const sofaGeometry = new THREE.BoxGeometry(sofaWidth, sofaHeight, sofaDepth);
  const sofa = new THREE.Mesh(sofaGeometry, materials.sofa);
  sofa.position.set(0, floorY + sofaHeight / 2, -halfDepth + sofaDepth / 2 + 0.3);
  sofa.castShadow = true;
  sofa.receiveShadow = true;
  roomGroup.add(sofa);
  
  // Добавляем подушки на диван
  const cushionSize = 0.2;
  const cushionGeometry = new THREE.BoxGeometry(cushionSize, cushionSize, cushionSize);
  const cushionMaterial = new THREE.MeshStandardMaterial({
    color: 0x4682B4, // Более темный синий для подушек
    roughness: 0.9,
    metalness: 0.05
  });
  
  // Левая подушка
  const leftCushion = new THREE.Mesh(cushionGeometry, cushionMaterial);
  leftCushion.position.set(-sofaWidth / 4, floorY + sofaHeight + cushionSize / 2 - 0.1, -halfDepth + sofaDepth / 2 + 0.3);
  leftCushion.castShadow = true;
  roomGroup.add(leftCushion);
  
  // Правая подушка
  const rightCushion = new THREE.Mesh(cushionGeometry, cushionMaterial);
  rightCushion.position.set(sofaWidth / 4, floorY + sofaHeight + cushionSize / 2 - 0.1, -halfDepth + sofaDepth / 2 + 0.3);
  rightCushion.castShadow = true;
  roomGroup.add(rightCushion);
  
  // Создаем журнальный столик
  const tableWidth = size.x * 0.3;
  const tableDepth = size.z * 0.2;
  const tableHeight = 0.4;
  
  const tableGeometry = new THREE.BoxGeometry(tableWidth, tableHeight, tableDepth);
  const table = new THREE.Mesh(tableGeometry, materials.wood);
  table.position.set(0, floorY + tableHeight / 2, 0);
  table.castShadow = true;
  table.receiveShadow = true;
  roomGroup.add(table);
  
  // Телевизор
  const tvWidth = size.x * 0.4;
  const tvHeight = size.y * 0.3;
  const tvDepth = 0.05;
  
  const tvStandHeight = 0.5;
  const tvStandWidth = tvWidth * 0.5;
  const tvStandDepth = 0.3;
  
  // Подставка для ТВ
  const tvStandGeometry = new THREE.BoxGeometry(tvStandWidth, tvStandHeight, tvStandDepth);
  const tvStand = new THREE.Mesh(tvStandGeometry, materials.wood);
  tvStand.position.set(0, floorY + tvStandHeight / 2, halfDepth - tvStandDepth / 2 - 0.3);
  tvStand.castShadow = true;
  tvStand.receiveShadow = true;
  roomGroup.add(tvStand);
  
  // Экран ТВ
  const tvGeometry = new THREE.BoxGeometry(tvWidth, tvHeight, tvDepth);
  const tv = new THREE.Mesh(tvGeometry, materials.tv);
  tv.position.set(0, floorY + tvStandHeight + tvHeight / 2, halfDepth - tvDepth / 2 - 0.3);
  tv.castShadow = true;
  roomGroup.add(tv);
  
  // Добавляем настольную лампу на столик
  const lampBaseRadius = 0.1;
  const lampBaseHeight = 0.05;
  const lampPoleHeight = 0.3;
  const lampPoleRadius = 0.02;
  const lampShadeRadius = 0.15;
  const lampShadeHeight = 0.15;
  
  // База лампы
  const lampBaseGeometry = new THREE.CylinderGeometry(lampBaseRadius, lampBaseRadius, lampBaseHeight, 16);
  const lampBase = new THREE.Mesh(lampBaseGeometry, materials.metallic);
  lampBase.position.set(tableWidth/3, floorY + tableHeight + lampBaseHeight/2, -tableDepth/3);
  lampBase.castShadow = true;
  roomGroup.add(lampBase);
  
  // Стойка лампы
  const lampPoleGeometry = new THREE.CylinderGeometry(lampPoleRadius, lampPoleRadius, lampPoleHeight, 8);
  const lampPole = new THREE.Mesh(lampPoleGeometry, materials.metallic);
  lampPole.position.set(tableWidth/3, floorY + tableHeight + lampBaseHeight + lampPoleHeight/2, -tableDepth/3);
  lampPole.castShadow = true;
  roomGroup.add(lampPole);
  
  // Абажур лампы
  const lampShadeGeometry = new THREE.ConeGeometry(lampShadeRadius, lampShadeHeight, 16, 1, true);
  const lampShadeMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFAF0E6, 
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  });
  const lampShade = new THREE.Mesh(lampShadeGeometry, lampShadeMaterial);
  lampShade.position.set(tableWidth/3, floorY + tableHeight + lampBaseHeight + lampPoleHeight + lampShadeHeight/2, -tableDepth/3);
  lampShade.castShadow = true;
  roomGroup.add(lampShade);
  
  // Свет от лампы
  const lampLight = new THREE.PointLight(0xffffcc, 0.3, 3);
  lampLight.position.set(tableWidth/3, floorY + tableHeight + lampBaseHeight + lampPoleHeight, -tableDepth/3);
  roomGroup.add(lampLight);
};

// Функция для добавления мебели в спальню
const addBedroomFurniture = (roomGroup: THREE.Group, size: THREE.Vector3) => {
  const halfWidth = size.x / 2;
  const halfDepth = size.z / 2;
  const floorY = -size.y / 2;
  
  // Создаем кровать
  const bedWidth = size.x * 0.6;
  const bedLength = size.z * 0.5;
  const bedHeight = 0.3;
  const mattressHeight = 0.1;
  
  // Каркас кровати
  const bedFrameGeometry = new THREE.BoxGeometry(bedWidth, bedHeight, bedLength);
  const bedFrame = new THREE.Mesh(bedFrameGeometry, materials.wood);
  bedFrame.position.set(0, floorY + bedHeight / 2, 0);
  bedFrame.castShadow = true;
  bedFrame.receiveShadow = true;
  roomGroup.add(bedFrame);
  
  // Матрас
  const mattressGeometry = new THREE.BoxGeometry(bedWidth * 0.95, mattressHeight, bedLength * 0.9);
  const mattressMaterial = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    roughness: 0.9,
    metalness: 0.05
  });
  const mattress = new THREE.Mesh(mattressGeometry, mattressMaterial);
  mattress.position.set(0, floorY + bedHeight + mattressHeight / 2, 0);
  mattress.castShadow = true;
  roomGroup.add(mattress);
  
  // Подушки
  const pillowWidth = bedWidth * 0.2;
  const pillowLength = bedLength * 0.2;
  const pillowHeight = 0.1;
  const pillowGeometry = new THREE.BoxGeometry(pillowWidth, pillowHeight, pillowLength);
  
  // Левая подушка
  const leftPillow = new THREE.Mesh(pillowGeometry, materials.bedding);
  leftPillow.position.set(-bedWidth * 0.25, floorY + bedHeight + mattressHeight + pillowHeight / 2, -bedLength * 0.3);
  leftPillow.castShadow = true;
  roomGroup.add(leftPillow);
  
  // Правая подушка
  const rightPillow = new THREE.Mesh(pillowGeometry, materials.bedding);
  rightPillow.position.set(bedWidth * 0.25, floorY + bedHeight + mattressHeight + pillowHeight / 2, -bedLength * 0.3);
  rightPillow.castShadow = true;
  roomGroup.add(rightPillow);
  
  // Одеяло
  const blanketGeometry = new THREE.BoxGeometry(bedWidth * 0.9, 0.05, bedLength * 0.6);
  const blanketMaterial = new THREE.MeshStandardMaterial({
    color: 0xADD8E6, // Светло-голубое одеяло
    roughness: 0.9,
    metalness: 0.1
  });
  const blanket = new THREE.Mesh(blanketGeometry, blanketMaterial);
  blanket.position.set(0, floorY + bedHeight + mattressHeight + 0.05, bedLength * 0.1);
  blanket.castShadow = true;
  roomGroup.add(blanket);
  
  // Тумбочки
  const nightstandWidth = size.x * 0.15;
  const nightstandDepth = size.z * 0.15;
  const nightstandHeight = 0.5;
  
  // Левая тумбочка
  const leftNightstandGeometry = new THREE.BoxGeometry(nightstandWidth, nightstandHeight, nightstandDepth);
  const leftNightstand = new THREE.Mesh(leftNightstandGeometry, materials.wood);
  leftNightstand.position.set(-bedWidth / 2 - nightstandWidth / 2 - 0.1, floorY + nightstandHeight / 2, -bedLength / 4);
  leftNightstand.castShadow = true;
  leftNightstand.receiveShadow = true;
  roomGroup.add(leftNightstand);
  
  // Правая тумбочка
  const rightNightstand = leftNightstand.clone();
  rightNightstand.position.set(bedWidth / 2 + nightstandWidth / 2 + 0.1, floorY + nightstandHeight / 2, -bedLength / 4);
  roomGroup.add(rightNightstand);
  
  // Настольные лампы
  const lampHeight = 0.3;
  const lampBaseRadius = 0.08;
  const lampShadeRadius = 0.12;
  
  // Левая лампа
  const leftLampBaseGeometry = new THREE.CylinderGeometry(lampBaseRadius, lampBaseRadius, 0.05, 16);
  const leftLampBase = new THREE.Mesh(leftLampBaseGeometry, materials.metallic);
  leftLampBase.position.set(-bedWidth / 2 - nightstandWidth / 2 - 0.1, floorY + nightstandHeight + 0.025, -bedLength / 4);
  leftLampBase.castShadow = true;
  roomGroup.add(leftLampBase);
  
  const leftLampShadeGeometry = new THREE.CylinderGeometry(lampShadeRadius, lampShadeRadius, lampHeight, 16);
  const leftLampShadeMaterial = new THREE.MeshStandardMaterial({
    color: 0xF5F5DC, // Бежевый абажур
    transparent: true,
    opacity: 0.8
  });
  const leftLampShade = new THREE.Mesh(leftLampShadeGeometry, leftLampShadeMaterial);
  leftLampShade.position.set(-bedWidth / 2 - nightstandWidth / 2 - 0.1, floorY + nightstandHeight + lampHeight / 2 + 0.05, -bedLength / 4);
  leftLampShade.castShadow = true;
  roomGroup.add(leftLampShade);
  
  // Правая лампа (клон левой)
  const rightLampBase = leftLampBase.clone();
  rightLampBase.position.set(bedWidth / 2 + nightstandWidth / 2 + 0.1, floorY + nightstandHeight + 0.025, -bedLength / 4);
  roomGroup.add(rightLampBase);
  
  const rightLampShade = leftLampShade.clone();
  rightLampShade.position.set(bedWidth / 2 + nightstandWidth / 2 + 0.1, floorY + nightstandHeight + lampHeight / 2 + 0.05, -bedLength / 4);
  roomGroup.add(rightLampShade);
  
  // Шкаф
  const wardrobeWidth = size.x * 0.25;
  const wardrobeDepth = size.z * 0.2;
  const wardrobeHeight = size.y * 0.8;
  
  const wardrobeGeometry = new THREE.BoxGeometry(wardrobeWidth, wardrobeHeight, wardrobeDepth);
  const wardrobe = new THREE.Mesh(wardrobeGeometry, materials.wood);
  wardrobe.position.set(-halfWidth + wardrobeWidth / 2 + 0.2, floorY + wardrobeHeight / 2, halfDepth - wardrobeDepth / 2 - 0.2);
  wardrobe.castShadow = true;
  wardrobe.receiveShadow = true;
  roomGroup.add(wardrobe);
  
  // Зеркало
  const mirrorWidth = size.x * 0.2;
  const mirrorHeight = size.y * 0.5;
  const mirrorDepth = 0.05;
  
  const mirrorGeometry = new THREE.BoxGeometry(mirrorWidth, mirrorHeight, mirrorDepth);
  const mirrorMaterial = new THREE.MeshStandardMaterial({
    color: 0xEEEEEE,
    roughness: 0.1,
    metalness: 0.9,
    envMapIntensity: 1
  });
  const mirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
  mirror.position.set(halfWidth - mirrorWidth / 2 - 0.2, floorY + mirrorHeight / 2 + 0.5, halfDepth - mirrorDepth / 2 - 0.1);
  mirror.castShadow = true;
  roomGroup.add(mirror);
};

// Функция для добавления мебели на кухню
const addKitchenFurniture = (roomGroup: THREE.Group, size: THREE.Vector3) => {
  const halfWidth = size.x / 2;
  const halfDepth = size.z / 2;
  const floorY = -size.y / 2;
  
  // Кухонные шкафы (нижние)
  const cabinetWidth = size.x * 0.8;
  const cabinetDepth = size.z * 0.2;
  const cabinetHeight = 0.8;
  
  const cabinetGeometry = new THREE.BoxGeometry(cabinetWidth, cabinetHeight, cabinetDepth);
  const cabinet = new THREE.Mesh(cabinetGeometry, materials.wood);
  cabinet.position.set(0, floorY + cabinetHeight / 2, -halfDepth + cabinetDepth / 2 + 0.1);
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  roomGroup.add(cabinet);
  
  // Столешница
  const countertopGeometry = new THREE.BoxGeometry(cabinetWidth + 0.1, 0.05, cabinetDepth + 0.1);
  const countertop = new THREE.Mesh(countertopGeometry, materials.kitchenCounter);
  countertop.position.set(0, floorY + cabinetHeight + 0.025, -halfDepth + cabinetDepth / 2 + 0.1);
  countertop.receiveShadow = true;
  roomGroup.add(countertop);
  
  // Раковина
  const sinkWidth = cabinetWidth * 0.3;
  const sinkDepth = cabinetDepth * 0.6;
  const sinkHeight = 0.1;
  
  const sinkGeometry = new THREE.BoxGeometry(sinkWidth, sinkHeight, sinkDepth);
  const sinkMaterial = new THREE.MeshStandardMaterial({
    color: 0xC0C0C0,
    roughness: 0.2,
    metalness: 0.8
  });
  const sink = new THREE.Mesh(sinkGeometry, sinkMaterial);
  sink.position.set(-cabinetWidth / 4, floorY + cabinetHeight + 0.025, -halfDepth + cabinetDepth / 2 + 0.1);
  sink.receiveShadow = true;
  roomGroup.add(sink);
  
  // Кран
  const faucetHeight = 0.2;
  const faucetRadius = 0.02;
  
  const faucetBaseGeometry = new THREE.CylinderGeometry(faucetRadius, faucetRadius, faucetHeight, 8);
  const faucet = new THREE.Mesh(faucetBaseGeometry, materials.metallic);
  faucet.position.set(-cabinetWidth / 4, floorY + cabinetHeight + faucetHeight / 2 + 0.05, -halfDepth + cabinetDepth / 2 + 0.05);
  faucet.castShadow = true;
  roomGroup.add(faucet);
  
  // Плита
  const stoveWidth = cabinetWidth * 0.3;
  const stoveDepth = cabinetDepth * 0.8;
  const stoveHeight = 0.05;
  
  const stoveGeometry = new THREE.BoxGeometry(stoveWidth, stoveHeight, stoveDepth);
  const stoveMaterial = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 0.7,
    metalness: 0.3
  });
  const stove = new THREE.Mesh(stoveGeometry, stoveMaterial);
  stove.position.set(cabinetWidth / 4, floorY + cabinetHeight + stoveHeight / 2, -halfDepth + cabinetDepth / 2 + 0.1);
  stove.receiveShadow = true;
  roomGroup.add(stove);
  
  // Конфорки
  const burnerRadius = 0.05;
  const burnerHeight = 0.01;
  const burnerGeometry = new THREE.CylinderGeometry(burnerRadius, burnerRadius, burnerHeight, 16);
  const burnerMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.8,
    metalness: 0.5
  });
  
  // Левая конфорка
  const leftBurner = new THREE.Mesh(burnerGeometry, burnerMaterial);
  leftBurner.position.set(cabinetWidth / 4 - stoveWidth / 4, floorY + cabinetHeight + stoveHeight + burnerHeight / 2, -halfDepth + cabinetDepth / 2 - stoveDepth / 4);
  roomGroup.add(leftBurner);
  
  // Правая конфорка
  const rightBurner = new THREE.Mesh(burnerGeometry, burnerMaterial);
  rightBurner.position.set(cabinetWidth / 4 + stoveWidth / 4, floorY + cabinetHeight + stoveHeight + burnerHeight / 2, -halfDepth + cabinetDepth / 2 - stoveDepth / 4);
  roomGroup.add(rightBurner);
  
  // Нижняя левая конфорка
  const bottomLeftBurner = new THREE.Mesh(burnerGeometry, burnerMaterial);
  bottomLeftBurner.position.set(cabinetWidth / 4 - stoveWidth / 4, floorY + cabinetHeight + stoveHeight + burnerHeight / 2, -halfDepth + cabinetDepth / 2 + stoveDepth / 4);
  roomGroup.add(bottomLeftBurner);
  
  // Нижняя правая конфорка
  const bottomRightBurner = new THREE.Mesh(burnerGeometry, burnerMaterial);
  bottomRightBurner.position.set(cabinetWidth / 4 + stoveWidth / 4, floorY + cabinetHeight + stoveHeight + burnerHeight / 2, -halfDepth + cabinetDepth / 2 + stoveDepth / 4);
  roomGroup.add(bottomRightBurner);
  
  // Верхние шкафы
  const upperCabinetHeight = 0.6;
  const upperCabinetGeometry = new THREE.BoxGeometry(cabinetWidth, upperCabinetHeight, cabinetDepth * 0.7);
  const upperCabinet = new THREE.Mesh(upperCabinetGeometry, materials.wood);
  upperCabinet.position.set(0, floorY + size.y - upperCabinetHeight / 2 - 0.2, -halfDepth + cabinetDepth / 2 * 0.7 + 0.1);
  upperCabinet.castShadow = true;
  roomGroup.add(upperCabinet);
  
  // Холодильник
  const fridgeWidth = size.x * 0.15;
  const fridgeDepth = size.z * 0.2;
  const fridgeHeight = size.y * 0.8;
  
  const fridgeGeometry = new THREE.BoxGeometry(fridgeWidth, fridgeHeight, fridgeDepth);
  const fridge = new THREE.Mesh(fridgeGeometry, materials.fridge);
  fridge.position.set(halfWidth - fridgeWidth / 2 - 0.2, floorY + fridgeHeight / 2, -halfDepth + fridgeDepth / 2 + 0.1);
  fridge.castShadow = true;
  fridge.receiveShadow = true;
  roomGroup.add(fridge);
  
  // Ручка холодильника
  const handleWidth = 0.02;
  const handleHeight = 0.2;
  const handleDepth = 0.05;
  
  const handleGeometry = new THREE.BoxGeometry(handleWidth, handleHeight, handleDepth);
  const handle = new THREE.Mesh(handleGeometry, materials.metallic);
  handle.position.set(halfWidth - fridgeWidth - 0.2 + 0.05, floorY + fridgeHeight / 2, -halfDepth + fridgeDepth / 2 + 0.1 + fridgeDepth / 2 + handleDepth / 2);
  handle.castShadow = true;
  roomGroup.add(handle);
  
  // Обеденный стол
  const tableWidth = size.x * 0.4;
  const tableLength = size.z * 0.3;
  const tableHeight = 0.75;
  
  const tableGeometry = new THREE.BoxGeometry(tableWidth, 0.05, tableLength);
  const table = new THREE.Mesh(tableGeometry, materials.wood);
  table.position.set(0, floorY + tableHeight, halfDepth - tableLength / 2 - 0.5);
  table.castShadow = true;
  table.receiveShadow = true;
  roomGroup.add(table);
  
  // Ножки стола
  const legRadius = 0.03;
  const legHeight = tableHeight;
  const legGeometry = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8);
  
  // Передняя левая ножка
  const frontLeftLeg = new THREE.Mesh(legGeometry, materials.wood);
  frontLeftLeg.position.set(-tableWidth / 2 + legRadius, floorY + legHeight / 2, halfDepth - tableLength + legRadius - 0.5);
  frontLeftLeg.castShadow = true;
  roomGroup.add(frontLeftLeg);
  
  // Передняя правая ножка
  const frontRightLeg = new THREE.Mesh(legGeometry, materials.wood);
  frontRightLeg.position.set(tableWidth / 2 - legRadius, floorY + legHeight / 2, halfDepth - tableLength + legRadius - 0.5);
  frontRightLeg.castShadow = true;
  roomGroup.add(frontRightLeg);
  
  // Задняя левая ножка
  const backLeftLeg = new THREE.Mesh(legGeometry, materials.wood);
  backLeftLeg.position.set(-tableWidth / 2 + legRadius, floorY + legHeight / 2, halfDepth - legRadius - 0.5);
  backLeftLeg.castShadow = true;
  roomGroup.add(backLeftLeg);
  
  // Задняя правая ножка
  const backRightLeg = new THREE.Mesh(legGeometry, materials.wood);
  backRightLeg.position.set(tableWidth / 2 - legRadius, floorY + legHeight / 2, halfDepth - legRadius - 0.5);
  backRightLeg.castShadow = true;
  roomGroup.add(backRightLeg);
  
  // Создаем стулья
  const chairWidth = 0.4;
  const chairDepth = 0.4;
  const chairSeatHeight = 0.45;
  const chairBackHeight = 0.4;
  
  // Функция для создания стула
  const createChair = (x: number, z: number) => {
    // Группа для стула
    const chairGroup = new THREE.Group();
    chairGroup.position.set(x, floorY, z);
    
    // Сиденье
    const seatGeometry = new THREE.BoxGeometry(chairWidth, 0.05, chairDepth);
    const seat = new THREE.Mesh(seatGeometry, materials.wood);
    seat.position.set(0, chairSeatHeight, 0);
    seat.castShadow = true;
    seat.receiveShadow = true;
    chairGroup.add(seat);
    
    // Спинка
    const backGeometry = new THREE.BoxGeometry(chairWidth, chairBackHeight, 0.05);
    const back = new THREE.Mesh(backGeometry, materials.wood);
    back.position.set(0, chairSeatHeight + chairBackHeight / 2, -chairDepth / 2 + 0.025);
    back.castShadow = true;
    chairGroup.add(back);
    
    // Ножки
    const legRadius = 0.02;
    const legGeometry = new THREE.CylinderGeometry(legRadius, legRadius, chairSeatHeight, 8);
    
    // Передняя левая ножка
    const frontLeftLeg = new THREE.Mesh(legGeometry, materials.wood);
    frontLeftLeg.position.set(-chairWidth / 2 + legRadius, chairSeatHeight / 2, chairDepth / 2 - legRadius);
    frontLeftLeg.castShadow = true;
    chairGroup.add(frontLeftLeg);
    
    // Передняя правая ножка
    const frontRightLeg = new THREE.Mesh(legGeometry, materials.wood);
    frontRightLeg.position.set(chairWidth / 2 - legRadius, chairSeatHeight / 2, chairDepth / 2 - legRadius);
    frontRightLeg.castShadow = true;
    chairGroup.add(frontRightLeg);
    
    // Задняя левая ножка
    const backLeftLeg = new THREE.Mesh(legGeometry, materials.wood);
    backLeftLeg.position.set(-chairWidth / 2 + legRadius, chairSeatHeight / 2, -chairDepth / 2 + legRadius);
    backLeftLeg.castShadow = true;
    chairGroup.add(backLeftLeg);
    
    // Задняя правая ножка
    const backRightLeg = new THREE.Mesh(legGeometry, materials.wood);
    backRightLeg.position.set(chairWidth / 2 - legRadius, chairSeatHeight / 2, -chairDepth / 2 + legRadius);
    backRightLeg.castShadow = true;
    chairGroup.add(backRightLeg);
    
    return chairGroup;
  };
  
  // Создаем 4 стула вокруг стола
  const chair1 = createChair(-tableWidth / 4, halfDepth - tableLength - 0.3 - 0.5);
  roomGroup.add(chair1);
  
  const chair2 = createChair(tableWidth / 4, halfDepth - tableLength - 0.3 - 0.5);
  roomGroup.add(chair2);
  
  const chair3 = createChair(-tableWidth / 4, halfDepth - 0.3 - 0.5);
  chair3.rotation.y = Math.PI;
  roomGroup.add(chair3);
  
  const chair4 = createChair(tableWidth / 4, halfDepth - 0.3 - 0.5);
  chair4.rotation.y = Math.PI;
  roomGroup.add(chair4);
};

// Создание двери
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
  
  // Определяем позицию и поворот в зависимости от стены
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
  
  // Создаем дверной проем (вырезая часть стены)
  // Это делается путем создания дополнительных частей стены вместо вырезания части
  
  // Создаем дверную раму
  const frameGeometry = new THREE.BoxGeometry(doorWidth + 0.1, doorHeight + 0.05, wallThickness * 1.1);
  const frameMaterial = materials.frame;
  const doorFrame = new THREE.Mesh(frameGeometry, frameMaterial);
  doorFrame.position.copy(doorPosition);
  doorFrame.rotation.y = doorRotation;
  roomGroup.add(doorFrame);
  
  // Создаем саму дверь
  const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, wallThickness / 2);
  const doorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xa1887f, 
    roughness: 0.7,
    metalness: 0.1
  });
  const doorMesh = new THREE.Mesh(doorGeometry, doorMaterial);
  
  // Слегка смещаем дверь, чтобы она была на краю проема
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
  
  // Добавляем дверную ручку
  const handleGeometry = new THREE.SphereGeometry(0.05);
  const handleMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xb0bec5, 
    roughness: 0.5,
    metalness: 0.8
  });
  const doorHandle = new THREE.Mesh(handleGeometry, handleMaterial);
  
  // Позиционируем ручку на двери
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

// Создание окна
const createWindow = (
  roomGroup: THREE.Group,
  window: { wall: 'north' | 'east' | 'south' | 'west'; offset: number; width: number },
  roomSize: THREE.Vector3,
  wallThickness: number
) => {
  const windowWidth = window.width;
  const windowHeight = 1.2;
  const windowOffsetY = 0.3; // смещение от центра комнаты по Y
  const halfWidth = roomSize.x / 2;
  const halfDepth = roomSize.z / 2;
  
  let windowPosition: THREE.Vector3;
  let windowRotation = 0;
  
  // Определяем позицию и поворот в зависимости от стены
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
  
  // Создаем оконную раму
  const frameGeometry = new THREE.BoxGeometry(windowWidth + 0.1, windowHeight + 0.1, wallThickness * 1.1);
  const frameMaterial = materials.frame;
  const windowFrame = new THREE.Mesh(frameGeometry, frameMaterial);
  windowFrame.position.copy(windowPosition);
  windowFrame.rotation.y = windowRotation;
  roomGroup.add(windowFrame);
  
  // Создаем стекло
  const glassGeometry = new THREE.BoxGeometry(windowWidth, windowHeight, wallThickness / 5);
  const glassMaterial = materials.glass;
  const glass = new THREE.Mesh(glassGeometry, glassMaterial);
  
  // Смещаем стекло немного вперед от рамы
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
  
  // Создаем решетку на окне (вертикальная и горизонтальная линии)
  const dividerMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x8d6e63, 
    roughness: 0.6,
    metalness: 0.2 
  });
  
  // Вертикальный разделитель
  const verticalDividerGeometry = new THREE.BoxGeometry(0.05, windowHeight, wallThickness / 3);
  const verticalDivider = new THREE.Mesh(verticalDividerGeometry, dividerMaterial);
  verticalDivider.position.copy(glass.position);
  verticalDivider.rotation.y = windowRotation;
  roomGroup.add(verticalDivider);
  
  // Горизонтальный разделитель
  const horizontalDividerGeometry = new THREE.BoxGeometry(windowWidth, 0.05, wallThickness / 3);
  const horizontalDivider = new THREE.Mesh(horizontalDividerGeometry, dividerMaterial);
  horizontalDivider.position.copy(glass.position);
  horizontalDivider.rotation.y = windowRotation;
  roomGroup.add(horizontalDivider);
};

// Расчет позиций для устройств в комнате
const calculateDevicePositions = (deviceCount: number, roomSize: THREE.Vector3): THREE.Vector3[] => {
  const positions: THREE.Vector3[] = [];
  const halfWidth = roomSize.x / 2 - 0.5;  // отступ от стен
  const halfDepth = roomSize.z / 2 - 0.5;  // отступ от стен
  
  // Для центральной люстры
  if (deviceCount === 1) {
    positions.push(new THREE.Vector3(0, 0, 0));
    return positions;
  }
  
  // Для нескольких устройств распределяем по комнате
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

// Создание светильника
const createLightFixture = (
  roomGroup: THREE.Group,
  device: any,
  position: THREE.Vector3
) => {
  // Создаем группу для светильника
  const lightGroup = new THREE.Group();
  lightGroup.position.copy(position);
  lightGroup.userData = { deviceId: device.id, type: 'light' };
  roomGroup.add(lightGroup);
  
  // Крепление к потолку
  const fixtureGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 16);
  const fixtureMaterial = new THREE.MeshStandardMaterial({ color: 0x424242 });
  const fixture = new THREE.Mesh(fixtureGeometry, fixtureMaterial);
  fixture.position.y = 0;
  lightGroup.add(fixture);
  
  // Плафон
  const lampShadeGeometry = new THREE.ConeGeometry(0.3, 0.4, 16, 1, true);
  const lampShadeMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xeeeeee,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  });
  const lampShade = new THREE.Mesh(lampShadeGeometry, lampShadeMaterial);
  lampShade.position.y = -0.3;
  lampShade.rotation.x = Math.PI; // переворачиваем конус
  lightGroup.add(lampShade);
  
  // Лампочка
  const bulbGeometry = new THREE.SphereGeometry(0.1, 16, 16);
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: device.isOn ? 0xffff00 : 0x888888,
    emissive: device.isOn ? 0xffff00 : 0x000000,
    emissiveIntensity: device.isOn ? 0.5 : 0
  });
  const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
  bulb.position.y = -0.35;
  bulb.name = 'bulb'; // Добавляем имя для легкого поиска
  lightGroup.add(bulb);
  
  // Добавляем источник света, если светильник включен
  if (device.isOn) {
    const pointLight = new THREE.PointLight(0xffff99, 0.8, 10);
    pointLight.position.copy(bulb.position);
    lightGroup.add(pointLight);
    roomLights.set(device.id, pointLight);
  }
  
  // Сохраняем ссылку на устройство
  roomDevices.set(device.id, lightGroup);
};

// Создание вентилятора
const createFan = (
  roomGroup: THREE.Group,
  device: any,
  position: THREE.Vector3
) => {
  // Создаем группу для вентилятора
  const fanGroup = new THREE.Group();
  fanGroup.position.copy(position);
  fanGroup.userData = { deviceId: device.id, type: 'fan' };
  roomGroup.add(fanGroup);
  
  // Крепление к потолку
  const mountGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.3, 16);
  const mountMaterial = new THREE.MeshStandardMaterial({ color: 0x424242 });
  const mount = new THREE.Mesh(mountGeometry, mountMaterial);
  fanGroup.add(mount);
  
  // Корпус вентилятора
  const bodyGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x757575 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = -0.2;
  fanGroup.add(body);
  
  // Создаем группу для лопастей (для анимации вращения)
  const bladesGroup = new THREE.Group();
  bladesGroup.position.y = -0.25;
  fanGroup.add(bladesGroup);
  
  // Лопасти вентилятора
  const bladeGeometry = new THREE.BoxGeometry(0.6, 0.02, 0.1);
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade.rotation.y = (Math.PI * 2 / 3) * i;
    blade.castShadow = true;
    bladesGroup.add(blade);
  }
  
  // Сохраняем ссылку на устройство
  roomDevices.set(device.id, fanGroup);
  roomFans.set(device.id, bladesGroup);
};

// Создание термостата
const createThermostat = (
  roomGroup: THREE.Group,
  device: any,
  position: THREE.Vector3
) => {
  // Создаем группу для термостата
  const thermostatGroup = new THREE.Group();
  thermostatGroup.position.copy(position);
  thermostatGroup.userData = { deviceId: device.id, type: 'thermostat' };
  roomGroup.add(thermostatGroup);
  
  // Корпус термостата
  const bodyGeometry = new THREE.BoxGeometry(0.15, 0.2, 0.05);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  thermostatGroup.add(body);
  
  // Экран термостата
  const screenGeometry = new THREE.PlaneGeometry(0.1, 0.1);
  const screenMaterial = new THREE.MeshBasicMaterial({ color: 0x0d47a1 });
  const screen = new THREE.Mesh(screenGeometry, screenMaterial);
  screen.position.z = 0.026;
  thermostatGroup.add(screen);
  
  // Кнопки термостата
  const buttonGeometry = new THREE.BoxGeometry(0.03, 0.03, 0.01);
  const buttonMaterial = new THREE.MeshStandardMaterial({ color: 0x757575 });
  
  const buttonUp = new THREE.Mesh(buttonGeometry, buttonMaterial);
  buttonUp.position.set(0.05, 0.05, 0.03);
  thermostatGroup.add(buttonUp);
  
  const buttonDown = new THREE.Mesh(buttonGeometry, buttonMaterial);
  buttonDown.position.set(0.05, -0.05, 0.03);
  thermostatGroup.add(buttonDown);
  
  // Сохраняем ссылку на устройство
  roomDevices.set(device.id, thermostatGroup);
};

// Window resize handler
const onWindowResize = () => {
  if (!sceneContainer.value) return;
  
  camera.aspect = sceneContainer.value.clientWidth / sceneContainer.value.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(sceneContainer.value.clientWidth, sceneContainer.value.clientHeight);
};

// Animation loop
const animate = () => {
  animationFrameId = requestAnimationFrame(animate);
  
  // Animate fans
  roomFans.forEach((fan, deviceId) => {
    const device = houseStore.getDeviceById(deviceId);
    if (device?.isOn) {
      fan.rotation.y += 0.05 * (device.type === 'fan' ? (device as any).speed / 100 : 1);
    }
  });
  
  // Анимация мерцания при перегрузке
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

// Lifecycle hooks
onMounted(() => {
  // Используем MutationObserver для отслеживания изменений в DOM
  const checkAndInitialize = () => {
    if (sceneContainer.value && sceneContainer.value.offsetHeight > 0 && sceneContainer.value.offsetWidth > 0) {
      setupScene();
      console.log("3D сцена инициализирована");
    } else {
      console.log("Ожидание готовности контейнера сцены...");
      // Повторная попытка через 300мс
      setTimeout(checkAndInitialize, 300);
    }
  };

  // Запустим первую проверку с небольшой задержкой
  setTimeout(checkAndInitialize, 300);
});

onUnmounted(() => {
  // Clear timeout for hint
  if (hintTimerId) {
    clearTimeout(hintTimerId);
  }
  
  // Clean up resources
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  
  // Remove event listeners
  window.removeEventListener('resize', onWindowResize);
  sceneContainer.value?.removeEventListener('click', onMouseClick);
  
  // Dispose of the renderer
  if (renderer) {
    sceneContainer.value?.removeChild(renderer.domElement);
    renderer.dispose();
  }
  
  // Dispose of geometries and materials
  roomMeshes.forEach(group => {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(material => material.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  });
  
  // Clean up scene
  scene.clear();
  
  // Clear maps
  roomMeshes.clear();
  roomWalls.clear();
  roomFloors.clear();
  roomLights.clear();
  roomFans.clear();
  roomDevices.clear();
});

// Provide scene to child components if needed
provide('sceneInstance', {
  getScene: () => scene,
  getCamera: () => camera,
  getRenderer: () => renderer
});
</script>

<style scoped>
.scene-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: linear-gradient(to bottom, #bbdefb, #e3f2fd);
  border-radius: 8px;
}

.loading {
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
}

.controls-hint.visible {
  opacity: 1;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .controls-hint {
    font-size: 12px;
    padding: 6px 12px;
  }
}
</style>