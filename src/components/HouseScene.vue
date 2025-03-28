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
  // Стены
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
        notificationStore.addInfo(`Свет "${device.name}" ${actionText}`);
      }
    } else if (userData.type === 'fan') {
      // Toggle fan
      const device = houseStore.getDeviceById(userData.deviceId);
      if (device) {
        houseStore.toggleDevice(userData.deviceId);
        
        // Отправляем уведомление
        const actionText = device.isOn ? 'включен' : 'выключен';
        notificationStore.addInfo(`Вентилятор "${device.name}" ${actionText}`);
      }
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
  
  // Создаем группу для комнаты
  const roomGroup = new THREE.Group();
  roomGroup.position.copy(position);
  roomGroup.userData = { roomId: room.id, type: 'room' };
  houseGroup.add(roomGroup);
  roomMeshes.set(room.id, roomGroup);
  
  // Определяем цвет комнаты в зависимости от типа
  const roomColor = roomColors[room.type as keyof typeof roomColors] || roomColors.default;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: roomColor,
    roughness: 0.8,
    metalness: 0.2
  });
  
  // Создаем массив стен комнаты
  const walls: THREE.Mesh[] = [];
  
  // Создаем пол
  const floorGeometry = new THREE.BoxGeometry(size.x, 0.1, size.z);
  const floor = new THREE.Mesh(floorGeometry, materials.floor);
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
  
  // Добавляем двери
  doors.forEach(door => {
    createDoor(roomGroup, door, size, wallThickness);
  });
  
  // Добавляем окна
  windows.forEach(window => {
    createWindow(roomGroup, window, size, wallThickness);
  });
  
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
  
  // Helper function to create furniture
  const createFurniture = (type: string, size: THREE.Vector3, position: THREE.Vector3, rotation: number = 0, color: number = 0x8B4513) => {
    const furnitureGroup = new THREE.Group();
    furnitureGroup.position.copy(position);
    furnitureGroup.rotation.y = rotation;
    
    let geometry;
    const material = new THREE.MeshStandardMaterial({ 
      color: color,
      roughness: 0.7,
      metalness: 0.1
    });
    
    switch(type) {
      case 'table':
        // Table top
        geometry = new THREE.BoxGeometry(size.x, 0.05, size.z);
        const tableTop = new THREE.Mesh(geometry, material);
        tableTop.position.y = size.y;
        tableTop.castShadow = true;
        furnitureGroup.add(tableTop);
        
        // Table legs
        const legGeometry = new THREE.BoxGeometry(0.05, size.y, 0.05);
        const legMaterial = new THREE.MeshStandardMaterial({ color: color });
        
        // Add 4 legs at the corners
        const legPositions = [
          new THREE.Vector3(size.x/2 - 0.025, size.y/2, size.z/2 - 0.025),
          new THREE.Vector3(size.x/2 - 0.025, size.y/2, -size.z/2 + 0.025),
          new THREE.Vector3(-size.x/2 + 0.025, size.y/2, size.z/2 - 0.025),
          new THREE.Vector3(-size.x/2 + 0.025, size.y/2, -size.z/2 + 0.025)
        ];
        
        legPositions.forEach(pos => {
          const leg = new THREE.Mesh(legGeometry, legMaterial);
          leg.position.copy(pos);
          leg.castShadow = true;
          furnitureGroup.add(leg);
        });
        break;
        
      case 'chair':
        // Chair seat
        geometry = new THREE.BoxGeometry(size.x, 0.05, size.z);
        const seat = new THREE.Mesh(geometry, material);
        seat.position.y = size.y * 0.6;
        seat.castShadow = true;
        furnitureGroup.add(seat);
        
        // Chair back
        const backGeometry = new THREE.BoxGeometry(size.x, size.y * 0.6, 0.05);
        const back = new THREE.Mesh(backGeometry, material);
        back.position.set(0, size.y * 0.9, -size.z/2 + 0.025);
        back.castShadow = true;
        furnitureGroup.add(back);
        
        // Chair legs
        const chairLegGeometry = new THREE.BoxGeometry(0.03, size.y * 0.6, 0.03);
        const chairLegMaterial = new THREE.MeshStandardMaterial({ color: color });
        
        const chairLegPositions = [
          new THREE.Vector3(size.x/2 - 0.02, size.y * 0.3, size.z/2 - 0.02),
          new THREE.Vector3(size.x/2 - 0.02, size.y * 0.3, -size.z/2 + 0.02),
          new THREE.Vector3(-size.x/2 + 0.02, size.y * 0.3, size.z/2 - 0.02),
          new THREE.Vector3(-size.x/2 + 0.02, size.y * 0.3, -size.z/2 + 0.02)
        ];
        
        chairLegPositions.forEach(pos => {
          const leg = new THREE.Mesh(chairLegGeometry, chairLegMaterial);
          leg.position.copy(pos);
          leg.castShadow = true;
          furnitureGroup.add(leg);
        });
        break;
        
      case 'bed':
        // Bed base
        geometry = new THREE.BoxGeometry(size.x, size.y * 0.3, size.z);
        const bedBase = new THREE.Mesh(geometry, material);
        bedBase.position.y = size.y * 0.15;
        bedBase.castShadow = true;
        furnitureGroup.add(bedBase);
        
        // Mattress
        const mattressGeometry = new THREE.BoxGeometry(size.x - 0.1, size.y * 0.1, size.z - 0.1);
        const mattressMaterial = new THREE.MeshStandardMaterial({ 
          color: 0xFFFFFF,
          roughness: 0.9
        });
        const mattress = new THREE.Mesh(mattressGeometry, mattressMaterial);
        mattress.position.y = size.y * 0.35;
        mattress.castShadow = true;
        furnitureGroup.add(mattress);
        
        // Pillows
        const pillowGeometry = new THREE.BoxGeometry(size.x * 0.2, size.y * 0.08, size.z * 0.4);
        const pillowMaterial = new THREE.MeshStandardMaterial({ 
          color: 0xECECEC,
          roughness: 0.9
        });
        
        const pillow1 = new THREE.Mesh(pillowGeometry, pillowMaterial);
        pillow1.position.set(size.x * 0.3, size.y * 0.44, 0);
        pillow1.castShadow = true;
        furnitureGroup.add(pillow1);
        
        const pillow2 = new THREE.Mesh(pillowGeometry, pillowMaterial);
        pillow2.position.set(-size.x * 0.3, size.y * 0.44, 0);
        pillow2.castShadow = true;
        furnitureGroup.add(pillow2);
        
        // Bed headboard
        const headboardGeometry = new THREE.BoxGeometry(size.x, size.y * 0.5, 0.1);
        const headboard = new THREE.Mesh(headboardGeometry, material);
        headboard.position.set(0, size.y * 0.4, -size.z/2 - 0.05);
        headboard.castShadow = true;
        furnitureGroup.add(headboard);
        break;
        
      case 'couch':
        // Couch base
        geometry = new THREE.BoxGeometry(size.x, size.y * 0.4, size.z);
        const couchBase = new THREE.Mesh(geometry, material);
        couchBase.position.y = size.y * 0.2;
        couchBase.castShadow = true;
        furnitureGroup.add(couchBase);
        
        // Couch cushions
        const cushionGeometry = new THREE.BoxGeometry(size.x - 0.2, size.y * 0.15, size.z - 0.1);
        const cushionMaterial = new THREE.MeshStandardMaterial({ 
          color: color === 0x8B4513 ? 0x607D8B : color + 0x101010, 
          roughness: 0.9
        });
        const cushions = new THREE.Mesh(cushionGeometry, cushionMaterial);
        cushions.position.y = size.y * 0.425;
        cushions.castShadow = true;
        furnitureGroup.add(cushions);
        
        // Couch back
        const couchBackGeometry = new THREE.BoxGeometry(size.x, size.y * 0.4, 0.2);
        const couchBack = new THREE.Mesh(couchBackGeometry, material);
        couchBack.position.set(0, size.y * 0.4, -size.z/2 + 0.1);
        couchBack.castShadow = true;
        furnitureGroup.add(couchBack);
        
        // Couch arms
        const armGeometry = new THREE.BoxGeometry(0.2, size.y * 0.4, size.z);
        
        const leftArm = new THREE.Mesh(armGeometry, material);
        leftArm.position.set(-size.x/2 + 0.1, size.y * 0.4, 0);
        leftArm.castShadow = true;
        furnitureGroup.add(leftArm);
        
        const rightArm = new THREE.Mesh(armGeometry, material);
        rightArm.position.set(size.x/2 - 0.1, size.y * 0.4, 0);
        rightArm.castShadow = true;
        furnitureGroup.add(rightArm);
        break;
        
      case 'tv':
        // TV Stand
        const standGeometry = new THREE.BoxGeometry(size.x, size.y * 0.2, size.z * 0.6);
        const standMaterial = new THREE.MeshStandardMaterial({ 
          color: 0x555555,
          roughness: 0.6,
          metalness: 0.2
        });
        const stand = new THREE.Mesh(standGeometry, standMaterial);
        stand.position.y = size.y * 0.1;
        stand.castShadow = true;
        furnitureGroup.add(stand);
        
        // TV Screen
        const screenGeometry = new THREE.BoxGeometry(size.x, size.y * 0.6, size.z * 0.1);
        const screenMaterial = new THREE.MeshStandardMaterial({ 
          color: 0x111111, 
          roughness: 0.2,
          metalness: 0.8
        });
        const screen = new THREE.Mesh(screenGeometry, screenMaterial);
        screen.position.set(0, size.y * 0.5, 0);
        screen.castShadow = true;
        furnitureGroup.add(screen);
        break;
        
      case 'cabinet':
        // Cabinet base
        geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const cabinet = new THREE.Mesh(geometry, material);
        cabinet.position.y = size.y/2;
        cabinet.castShadow = true;
        furnitureGroup.add(cabinet);
        
        // Cabinet doors
        const doorGeometry = new THREE.BoxGeometry(size.x * 0.48, size.y * 0.9, 0.02);
        const doorMaterial = new THREE.MeshStandardMaterial({ 
          color: color === 0x8B4513 ? 0x6D4C41 : color,
          roughness: 0.7
        });
        
        const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
        leftDoor.position.set(-size.x * 0.24, 0, size.z/2 + 0.01);
        leftDoor.castShadow = true;
        furnitureGroup.add(leftDoor);
        
        const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
        rightDoor.position.set(size.x * 0.24, 0, size.z/2 + 0.01);
        rightDoor.castShadow = true;
        furnitureGroup.add(rightDoor);
        
        // Door handles
        const handleGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.06, 8);
        const handleMaterial = new THREE.MeshStandardMaterial({ 
          color: 0xBDBDBD, 
          metalness: 0.8
        });
        
        const leftHandle = new THREE.Mesh(handleGeometry, handleMaterial);
        leftHandle.rotation.z = Math.PI / 2;
        leftHandle.position.set(-size.x * 0.1, 0, size.z/2 + 0.03);
        leftHandle.castShadow = true;
        furnitureGroup.add(leftHandle);
        
        const rightHandle = new THREE.Mesh(handleGeometry, handleMaterial);
        rightHandle.rotation.z = Math.PI / 2;
        rightHandle.position.set(size.x * 0.1, 0, size.z/2 + 0.03);
        rightHandle.castShadow = true;
        furnitureGroup.add(rightHandle);
        break;
        
      case 'fridge':
        // Fridge body
        geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const fridgeMaterial = new THREE.MeshStandardMaterial({ 
          color: 0xEEEEEE,
          roughness: 0.3,
          metalness: 0.5
        });
        const fridge = new THREE.Mesh(geometry, fridgeMaterial);
        fridge.position.y = size.y/2;
        fridge.castShadow = true;
        furnitureGroup.add(fridge);
        
        // Fridge door
        const fridgeDoorGeometry = new THREE.BoxGeometry(size.x - 0.02, size.y * 0.65, 0.05);
        const fridgeDoor = new THREE.Mesh(fridgeDoorGeometry, fridgeMaterial);
        fridgeDoor.position.set(0, size.y * 0.25, size.z/2 + 0.025);
        fridgeDoor.castShadow = true;
        furnitureGroup.add(fridgeDoor);
        
        // Freezer door
        const freezerDoorGeometry = new THREE.BoxGeometry(size.x - 0.02, size.y * 0.3, 0.05);
        const freezerDoor = new THREE.Mesh(freezerDoorGeometry, fridgeMaterial);
        freezerDoor.position.set(0, size.y * 0.75, size.z/2 + 0.025);
        freezerDoor.castShadow = true;
        furnitureGroup.add(freezerDoor);
        
        // Door handles
        const fridgeHandleGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8);
        const fridgeHandleMaterial = new THREE.MeshStandardMaterial({ 
          color: 0x9E9E9E, 
          metalness: 0.8
        });
        
        const fridgeHandle = new THREE.Mesh(fridgeHandleGeometry, fridgeHandleMaterial);
        fridgeHandle.rotation.z = Math.PI / 2;
        fridgeHandle.position.set(size.x/2 - 0.05, size.y * 0.25, size.z/2 + 0.05);
        fridgeHandle.castShadow = true;
        furnitureGroup.add(fridgeHandle);
        
        const freezerHandle = new THREE.Mesh(fridgeHandleGeometry, fridgeHandleMaterial);
        freezerHandle.rotation.z = Math.PI / 2;
        freezerHandle.position.set(size.x/2 - 0.05, size.y * 0.75, size.z/2 + 0.05);
        freezerHandle.castShadow = true;
        furnitureGroup.add(freezerHandle);
        break;
        
      case 'rug':
        // Simple rug with rounded corners
        geometry = new THREE.BoxGeometry(size.x, 0.02, size.z);
        const rugMaterial = new THREE.MeshStandardMaterial({ 
          color: color,
          roughness: 0.9,
          metalness: 0
        });
        const rug = new THREE.Mesh(geometry, rugMaterial);
        rug.position.y = 0.01; // Slightly above the floor
        rug.receiveShadow = true;
        furnitureGroup.add(rug);
        break;
    }
    
    roomGroup.add(furnitureGroup);
    return furnitureGroup;
  };

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