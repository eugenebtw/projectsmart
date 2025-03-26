<template>
  <div ref="sceneContainer" class="scene-container">
    <div class="loading" v-if="isLoading">
      <div class="spinner"></div>
      <p>Загрузка 3D сцены...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide } from 'vue';
import * as THREE from 'three';
import { useHouseStore } from '../stores/house';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Stores
const houseStore = useHouseStore();

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
const roomMeshes: Map<string, THREE.Mesh> = new Map();
const roomLights: Map<string, THREE.Light> = new Map();
const roomFans: Map<string, THREE.Mesh> = new Map();

// Animation
let animationFrameId: number;

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
    const userData = intersectedObject.userData;
    
    if (userData.type === 'light') {
      // Toggle light
      const device = houseStore.getDeviceById(userData.deviceId);
      if (device) {
        houseStore.toggleDevice(userData.deviceId);

        // Update visual appearance
        const obj = intersectedObject as THREE.Mesh;
        if (obj.material) {
          // Handle both single material and array of materials
          if (Array.isArray(obj.material)) {
              (obj.material[0] as THREE.MeshBasicMaterial).color.set(
              device.isOn ? 0xffff00 : 0x888888
            );
          } else {
              (obj.material as THREE.MeshBasicMaterial).color.set(
              device.isOn ? 0xffff00 : 0x888888
            );
          }
        }

        // Add or remove point light
        if (device.isOn) {
          if (!roomLights.has(device.id)) {
            const pointLight = new THREE.PointLight(0xffff99, 1, 10);
            pointLight.position.copy(intersectedObject.position);
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
    } else if (userData.type === 'fan') {
      // Toggle fan
      const device = houseStore.getDeviceById(userData.deviceId);
      if (device) {
        houseStore.toggleDevice(userData.deviceId);
      }
    } else if (userData.type === 'room') {
      // Select room
      const room = houseStore.getRoomById(userData.roomId);
      if (room) {
        // Highlight selected room
        roomMeshes.forEach((mesh) => {
          (mesh.material as THREE.MeshStandardMaterial).color.set(0xffffff);
        });

        if (intersectedObject instanceof THREE.Mesh) {
          (intersectedObject.material as THREE.MeshStandardMaterial).color.set(0xaaffaa);
        }
      }
    }
  }
};

// Setup scene
const setupScene = () => {
  if (!sceneContainer.value) return;
  
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);
  
  // Create camera
  const aspect = sceneContainer.value.clientWidth / sceneContainer.value.clientHeight;
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
  camera.position.set(15, 15, 15);
  camera.lookAt(0, 0, 0);
  
  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(sceneContainer.value.clientWidth, sceneContainer.value.clientHeight);
  renderer.shadowMap.enabled = true;
  sceneContainer.value.appendChild(renderer.domElement);
  
  // Create orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  
  // Create raycaster for interaction
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 20, 10);
  directionalLight.castShadow = true;
  scene.add(directionalLight);
  
  // Add floor
  const floorGeometry = new THREE.PlaneGeometry(50, 50);
  const floorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xcccccc,
    roughness: 0.8,
    metalness: 0.2
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);
  
  // Build the house from store data
  buildHouse();
  
  // Add event listeners
  window.addEventListener('resize', onWindowResize);
  sceneContainer.value.addEventListener('click', onMouseClick);

  // Start animation
  animate();
  
  // Done loading
  isLoading.value = false;
};

// Build house from store data
const buildHouse = () => {
  const rooms = houseStore.rooms;
  
  // Position variables to layout the rooms
  let xOffset = -10;
  const zOffset = 0;
  const roomSpacing = 10;
  
  rooms.forEach((room) => {
    // Create room mesh
    const roomWidth = 8;
    const roomHeight = 3;
    const roomDepth = 8;
    
    // Create room geometry
    const roomGeometry = new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth);
    const roomMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    
    const roomMesh = new THREE.Mesh(roomGeometry, roomMaterial);
    roomMesh.position.set(xOffset, roomHeight / 2, zOffset);
    roomMesh.castShadow = true;
    roomMesh.receiveShadow = true;
    roomMesh.userData = { roomId: room.id, type: 'room' };
    
    // Add to scene and store reference
    scene.add(roomMesh);
    roomMeshes.set(room.id, roomMesh);
    
    // Add devices to the room
    room.devices.forEach((device) => {
      if (device.type === 'light') {
        // Create light
        const lightGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const lightMaterial = new THREE.MeshBasicMaterial({ 
          color: device.isOn ? 0xffff00 : 0x888888,
          transparent: true,
          opacity: 0.8
        });
        
        const lightMesh = new THREE.Mesh(lightGeometry, lightMaterial);
        lightMesh.position.set(
          roomMesh.position.x,
          roomMesh.position.y + 1.2,
          roomMesh.position.z
        );
        lightMesh.userData = { deviceId: device.id, type: 'light' };
        scene.add(lightMesh);
        
        // Add point light when device is on
        if (device.isOn) {
          const pointLight = new THREE.PointLight(0xffff99, 1, 10);
          pointLight.position.copy(lightMesh.position);
          scene.add(pointLight);
          roomLights.set(device.id, pointLight);
        }
      } else if (device.type === 'fan') {
        // Create fan
        const fanBaseGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);
        // const fanBaseGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 3);
        const fanBaseMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
        const fanBase = new THREE.Mesh(fanBaseGeometry, fanBaseMaterial);

        const fanBladeGeometry = new THREE.BoxGeometry(1.2, 0.05, 0.2);
        const fanBladeMaterial = new THREE.MeshStandardMaterial({ color: 0x0088ff });

        // Create fan blades
        const fanGroup = new THREE.Mesh();
        fanGroup.add(fanBase);

        for (let i = 0; i < 3; i++) {
          const blade = new THREE.Mesh(fanBladeGeometry, fanBladeMaterial);
          blade.position.x = 0;
          // blade.rotation.y += 0.05;
          blade.rotation.y = (Math.PI * 2 / 3) * i;
          fanGroup.add(blade);
        }

        // for (let i = 0; i < 3; i++) {
        //   const blade = new THREE.Mesh(fanBladeGeometry, fanBladeMaterial);
        //   blade.position.x = -0.6;
        //   blade.rotation.y += 0.05;
        //   // blade.rotation.y = (Math.PI * 2 / 3) * i;
        //   fanGroup.add(blade);
        // }

        // Position the fan group
        fanGroup.position.set(
          roomMesh.position.x + 2,
          roomMesh.position.y + 1.2,
          roomMesh.position.z + 2
        );

        fanGroup.userData = { deviceId: device.id, type: 'fan' };

        scene.add(fanGroup);
        roomFans.set(device.id, fanGroup);
      }
    });
    
    // Move to next room position
    xOffset += roomWidth + roomSpacing;
  });
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
  
  // Update controls
  controls.update();
  
  // Render scene
  renderer.render(scene, camera);
};

// Lifecycle hooks
onMounted(() => {
  setupScene();
});

onUnmounted(() => {
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
  background-color: rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top-color: var(--accent-color);
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
