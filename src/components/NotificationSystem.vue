<template>
  <div class="notification-container">
    <transition-group name="notification">
      <div 
        v-for="notification in notifications" 
        :key="notification.id"
        class="notification"
        :class="notificationClass(notification.type)"
      >
        <div class="notification-content">
          <div class="notification-icon">
            <i :class="notificationIcon(notification.type)"></i>
          </div>
          <div class="notification-message">{{ notification.message }}</div>
        </div>
        <button 
          class="notification-close" 
          @click="removeNotification(notification.id)"
        >
          <i class="fa fa-times"></i>
        </button>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useNotificationStore, NotificationType } from '../stores/notification';

const notificationStore = useNotificationStore();

// Получаем уведомления из хранилища
const notifications = computed(() => notificationStore.notifications);

// Получаем класс для определенного типа уведомления
const notificationClass = (type: NotificationType): string => {
  switch (type) {
    case NotificationType.SUCCESS:
      return 'notification-success';
    case NotificationType.ERROR:
      return 'notification-error';
    case NotificationType.WARNING:
      return 'notification-warning';
    case NotificationType.INFO:
      return 'notification-info';
    default:
      return '';
  }
};

// Получаем иконку для определенного типа уведомления
const notificationIcon = (type: NotificationType): string => {
  switch (type) {
    case NotificationType.SUCCESS:
      return 'fa fa-check-circle';
    case NotificationType.ERROR:
      return 'fa fa-exclamation-circle';
    case NotificationType.WARNING:
      return 'fa fa-exclamation-triangle';
    case NotificationType.INFO:
      return 'fa fa-info-circle';
    default:
      return '';
  }
};

// Удаляем уведомление
const removeNotification = (id: string) => {
  notificationStore.removeNotification(id);
};
</script>

<style scoped>
.notification-container {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 350px;
  max-width: calc(100vw - 40px);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification {
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  align-items: stretch;
  background-color: var(--card-bg);
}

.notification-content {
  flex: 1;
  padding: 12px 15px;
  display: flex;
  align-items: center;
}

.notification-icon {
  margin-right: 12px;
  font-size: 20px;
}

.notification-message {
  flex: 1;
  color: var(--text-color);
}

.notification-close {
  width: 40px;
  border: none;
  background: transparent;
  color: var(--text-color);
  opacity: 0.5;
  cursor: pointer;
  transition: opacity 0.2s;
}

.notification-close:hover {
  opacity: 1;
}

/* Стили для разных типов уведомлений */
.notification-success {
  border-left: 4px solid #4caf50;
}

.notification-success .notification-icon {
  color: #4caf50;
}

.notification-error {
  border-left: 4px solid #f44336;
}

.notification-error .notification-icon {
  color: #f44336;
}

.notification-warning {
  border-left: 4px solid #ff9800;
}

.notification-warning .notification-icon {
  color: #ff9800;
}

.notification-info {
  border-left: 4px solid #2196f3;
}

.notification-info .notification-icon {
  color: #2196f3;
}

/* Анимации */
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

/* Адаптивные стили для мобильных устройств */
@media (max-width: 768px) {
  .notification-container {
    top: 10px;
    right: 10px;
    width: calc(100vw - 20px);
  }
  
  .notification {
    max-width: 100%;
  }
}
</style>
