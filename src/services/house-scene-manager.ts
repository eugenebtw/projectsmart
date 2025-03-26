import * as THREE from 'three';
import type { Room, SmartDevice, Light, Fan } from '../types';

/**
 * Класс для управления 3D сценой умного дома
 */
export class HouseSceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  
  // Объекты сцены
  private roomObjects: Record<string, THREE.Mesh> = {};
  private lightObjects: Record<string, THREE.Mesh> = {};
  private fanObjects: Record<string, THREE.Group> = {};
  
  // Состояние
  private isOverloaded: boolean = false;
  private animationId: number | null = null;

  /**
   * Создает экземпляр HouseSceneManager
   * @param container DOM-элемент для отображения сцены
   */
  constructor(private container: HTMLElement) {
    // Инициализация сцены
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);
    
    // Инициализация камеры
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 5, 10);
    
    // Инициализация рендерера
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);
    
    // Инициализация raycaster для взаимодействия
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Добавление базового освещения
    this.setupLights();
    
    // Обработчик изменения размера окна
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Настраивает базовое освещение сцены
   */
  private setupLights(): void {
    // Ambient light для базового освещения
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    // Directional light для создания теней
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    this.scene.add(directionalLight);
  }

  /**
   * Обрабатывает изменение размера окна
   */
  private handleResize = (): void => {
    if (!this.container) return;
    
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  /**
   * Создает 3D модель комнаты
   * @param room Данные комнаты
   * @param position Позиция комнаты
   * @param dimensions Размеры комнаты
   * @param color Цвет комнаты
   */
  public createRoom(
    room: Room, 
    position: THREE.Vector3, 
    dimensions: THREE.Vector3, 
    color: number
  ): void {
    // Создаем геометрию комнаты
    const geometry = new THREE.BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
    const material = new THREE.MeshPhongMaterial({
      color,
      transparent: true,
      opacity: 0.7,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.roomId = room.id;
    mesh.userData.type = 'room';
    
    this.scene.add(mesh);
    this.roomObjects[room.id] = mesh;
    
    // Создаем пол комнаты
    const floorGeometry = new THREE.PlaneGeometry(dimensions.x - 0.1, dimensions.z - 0.1);
    const floorMaterial = new THREE.MeshPhongMaterial({
      color: 0xeeeeee,
      side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = Math.PI / 2;
    floor.position.set(
      position.x,
      position.y - dimensions.y / 2 + 0.01, // Небольшое смещение, чтобы избежать z-fighting
      position.z
    );
    floor.receiveShadow = true;
    this.scene.add(floor);
    
    // Добавляем устройства в комнату
    room.devices.forEach(device => {
      if (device.type === 'light') {
        this.createLight(
          device as Light,
          position.clone().add(new THREE.Vector3(0, dimensions.y / 2 - 0.3, 0))
        );
      } else if (device.type === 'fan') {
        this.createFan(
          device as Fan,
          position.clone().add(new THREE.Vector3(0, dimensions.y / 2 - 0.4, dimensions.z / 3))
        );
      }
    });
  }

  /**
   * Создает 3D модель лампы
   * @param light Данные устройства освещения
   * @param position Позиция лампы
   */
  public createLight(light: Light, position: THREE.Vector3): void {
    // Создаем основу лампы
    const baseGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.1, 16);
    const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.copy(position);
    base.castShadow = true;
    
    // Создаем лампочку
    const bulbGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const bulbMaterial = new THREE.MeshStandardMaterial({
      color: light.isOn ? 0xffff00 : 0x888888,
      emissive: light.isOn ? 0xffff00 : 0x000000,
      emissiveIntensity: light.isOn ? 0.5 : 0,
    });
    const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
    bulb.position.copy(position.clone().add(new THREE.Vector3(0, -0.15, 0)));
    bulb.castShadow = true;
    bulb.userData.deviceId = light.id;
    bulb.userData.type = 'light';
    
    // Добавляем точечный свет
    if (light.isOn) {
      const pointLight = new THREE.PointLight(0xffffcc, 0.8, 5);
      pointLight.position.copy(bulb.position);
      bulb.add(pointLight);
    }
    
    this.scene.add(base);
    this.scene.add(bulb);
    this.lightObjects[light.id] = bulb;
  }

  /**
   * Создает 3D модель вентилятора
   * @param fan Данные вентилятора
   * @param position Позиция вентилятора
   */
  public createFan(fan: Fan, position: THREE.Vector3): void {
    // Создаем группу для вентилятора
    const fanGroup = new THREE.Group();
    fanGroup.position.copy(position);
    fanGroup.userData.deviceId = fan.id;
    fanGroup.userData.type = 'fan';
    fanGroup.userData.isOn = fan.isOn;
    
    // Основание вентилятора
    const baseGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.3, 16);
    const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x444444 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.castShadow = true;
    fanGroup.add(base);
    
    // Лопасти вентилятора
    const bladeGroup = new THREE.Group();
    bladeGroup.position.set(0, 0.2, 0);
    
    const bladeGeometry = new THREE.BoxGeometry(0.05, 0.01, 0.25);
    const bladeMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff });
    
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
      blade.rotation.y = Math.PI * 2 / 3 * i;
      blade.castShadow = true;
      bladeGroup.add(blade);
    }
    
    fanGroup.add(bladeGroup);
    
    this.scene.add(fanGroup);
    this.fanObjects[fan.id] = fanGroup;
  }

  /**
   * Обновляет состояние лампы
   * @param lightId ID лампы
   * @param isOn Включена/выключена
   */
  public updateLight(lightId: string, isOn: boolean): void {
    const light = this.lightObjects[lightId];
    if (!light) return;
    
    const material = light.material as THREE.MeshStandardMaterial;
    material.color.set(isOn ? 0xffff00 : 0x888888);
    material.emissive.set(isOn ? 0xffff00 : 0x000000);
    material.emissiveIntensity = isOn ? 0.5 : 0;
    
    // Обновляем точечный свет
    if (isOn) {
      if (light.children.length === 0) {
        const pointLight = new THREE.PointLight(0xffffcc, 0.8, 5);
        pointLight.position.copy(light.position);
        light.add(pointLight);
      }
    } else {
      light.children = [];
    }
  }

  /**
   * Обновляет состояние вентилятора
   * @param fanId ID вентилятора
   * @param isOn Включен/выключен
   */
  public updateFan(fanId: string, isOn: boolean): void {
    const fan = this.fanObjects[fanId];
    if (!fan) return;
    
    fan.userData.isOn = isOn;
  }

  /**
   * Устанавливает состояние перегрузки
   * @param isOverloaded Состояние перегрузки
   */
  public setOverloadState(isOverloaded: boolean): void {
    this.isOverloaded = isOverloaded;
  }

  /**
   * Вызывается при клике по сцене
   * @param event Событие клика
   * @param callback Callback-функция, которая вызывается при клике по объекту
   */
  public handleClick(event: MouseEvent, callback: (objectId: string, type: string) => void): void {
    if (!this.container) return;
    
    const rect = this.container.getBoundingClientRect();
    
    // Расчет координат мыши
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    if (intersects.length > 0) {
      // Находим первый интерактивный объект
      for (const intersect of intersects) {
        const object = intersect.object;
        
        if (object.userData.deviceId && object.userData.type) {
          callback(object.userData.deviceId, object.userData.type);
          break;
        } else if (object.userData.roomId && object.userData.type === 'room') {
          callback(object.userData.roomId, 'room');
          break;
        } else if (object.parent && object.parent.userData && object.parent.userData.deviceId) {
          callback(object.parent.userData.deviceId, object.parent.userData.type || '');
          break;
        }
      }
    }
  }
  
  /**
   * Настраивает обработчики событий для drag-and-drop
   */
  public setupDragAndDrop(): void {
    if (!this.container) return;
    
    // Обработчик для события dragover
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      
      // Выделяем комнату при наведении
      this.highlightRoomOnDragOver(event);
    };
    
    // Обработчик для события drop
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      
      if (!event.dataTransfer) return;
      
      const deviceType = event.dataTransfer.getData('application/device');
      if (!deviceType) return;
      
      const roomId = this.getRoomAtPosition(event);
      if (!roomId) return;
      
      // Удаляем подсветку комнат
      this.clearRoomHighlights();
      
      // Отправляем событие о том, что устройство было брошено в комнату
      window.dispatchEvent(new CustomEvent('device-dropped', { 
        detail: { deviceType, roomId } 
      }));
    };
    
    // Обработчик для события dragend
    const handleDragEnd = () => {
      // Удаляем подсветку комнат
      this.clearRoomHighlights();
      
      // Отправляем событие о завершении перетаскивания
      window.dispatchEvent(new CustomEvent('device-drag-end'));
    };
    
    // Настраиваем обработчики
    this.container.addEventListener('dragover', handleDragOver);
    this.container.addEventListener('drop', handleDrop);
    this.container.addEventListener('dragleave', this.clearRoomHighlights.bind(this));
    document.addEventListener('dragend', handleDragEnd);
    
    // Сохраняем ссылки на обработчики для возможности их удаления
    this.container.dragOverHandler = handleDragOver;
    this.container.dropHandler = handleDrop;
    this.container.dragLeaveHandler = this.clearRoomHighlights.bind(this);
    document.dragEndHandler = handleDragEnd;
  }
  
  /**
   * Удаляет обработчики событий drag-and-drop
   */
  public removeDragAndDropHandlers(): void {
    if (!this.container) return;
    
    if (this.container.dragOverHandler) {
      this.container.removeEventListener('dragover', this.container.dragOverHandler);
    }
    
    if (this.container.dropHandler) {
      this.container.removeEventListener('drop', this.container.dropHandler);
    }
    
    if (this.container.dragLeaveHandler) {
      this.container.removeEventListener('dragleave', this.container.dragLeaveHandler);
    }
    
    if (document.dragEndHandler) {
      document.removeEventListener('dragend', document.dragEndHandler);
    }
  }
  
  /**
   * Подсвечивает комнату при наведении на нее во время перетаскивания
   * @param event Событие dragover
   */
  private highlightRoomOnDragOver(event: DragEvent): void {
    // Очищаем текущую подсветку
    this.clearRoomHighlights();
    
    // Получаем комнату под курсором
    const roomId = this.getRoomAtPosition(event);
    if (!roomId) return;
    
    // Подсвечиваем комнату
    const room = this.roomObjects[roomId];
    if (room) {
      this.highlightRoom(room);
    }
  }
  
  /**
   * Подсвечивает комнату
   * @param room Объект комнаты
   */
  private highlightRoom(room: THREE.Mesh): void {
    // Сохраняем оригинальный цвет, если еще не сохранен
    if (!room.userData.originalColor) {
      const material = room.material as THREE.MeshPhongMaterial;
      room.userData.originalColor = material.color.clone();
      room.userData.originalOpacity = material.opacity;
    }
    
    // Применяем подсветку
    const material = room.material as THREE.MeshPhongMaterial;
    material.color.set(0x66ff66); // Яркий зеленый цвет
    material.opacity = 0.8;
  }
  
  /**
   * Удаляет подсветку со всех комнат
   */
  private clearRoomHighlights(): void {
    Object.values(this.roomObjects).forEach(room => {
      if (room.userData.originalColor) {
        const material = room.material as THREE.MeshPhongMaterial;
        material.color.copy(room.userData.originalColor);
        material.opacity = room.userData.originalOpacity;
        delete room.userData.originalColor;
        delete room.userData.originalOpacity;
      }
    });
  }
  
  /**
   * Определяет ID комнаты в позиции мыши
   * @param event Событие мыши или drag-and-drop
   * @returns ID комнаты или null, если комната не найдена
   */
  private getRoomAtPosition(event: MouseEvent | DragEvent): string | null {
    if (!this.container) return null;
    
    const rect = this.container.getBoundingClientRect();
    
    // Расчет координат мыши
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    if (intersects.length > 0) {
      // Ищем первую комнату в списке пересечений
      for (const intersect of intersects) {
        const object = intersect.object;
        
        if (object.userData.roomId && object.userData.type === 'room') {
          return object.userData.roomId;
        }
      }
    }
    
    return null;
  }

  /**
   * Анимирует сцену
   */
  public animate(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      
      // Анимация вентиляторов
      Object.values(this.fanObjects).forEach(fan => {
        if (fan.userData.isOn) {
          // Находим группу лопастей вентилятора (второй дочерний элемент)
          if (fan.children.length > 1) {
            fan.children[1].rotation.y += 0.1;
          }
        }
      });
      
      // Анимация мерцания при перегрузке
      if (this.isOverloaded) {
        Object.values(this.lightObjects).forEach(light => {
          const material = light.material as THREE.MeshStandardMaterial;
          if (material.emissiveIntensity > 0) { // Только для включенных ламп
            if (Math.random() > 0.7) {
              material.emissiveIntensity = Math.random() * 0.5;
            }
          }
        });
      }
      
      // Рендеринг сцены
      this.renderer.render(this.scene, this.camera);
    };
    
    animate();
  }

  /**
   * Очистка ресурсов и завершение работы
   */
  public dispose(): void {
    // Остановка анимации
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    // Очистка обработчиков событий
    window.removeEventListener('resize', this.handleResize);
    
    // Удаление рендерера из DOM
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
    
    // Очистка геометрий и материалов
    Object.values(this.roomObjects).forEach(obj => {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    });
    
    Object.values(this.lightObjects).forEach(obj => {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    });
    
    Object.values(this.fanObjects).forEach(group => {
      group.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    });
    
    // Очистка сцены
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    
    // Очистка объектов
    this.roomObjects = {};
    this.lightObjects = {};
    this.fanObjects = {};
  }
}
