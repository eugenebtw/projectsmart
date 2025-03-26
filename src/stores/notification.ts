import { defineStore } from 'pinia';
import { ref } from 'vue';

export enum NotificationType {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timeout?: number; // в миллисекундах
}

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<Notification[]>([]);

  // Добавить уведомление
  const addNotification = (notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    
    const newNotification: Notification = {
      ...notification,
      id,
      timeout: notification.timeout || getDefaultTimeout(notification.type)
    };
    
    notifications.value.push(newNotification);
    
    // Автоматически удаляем уведомление через указанное время
    if (newNotification.timeout > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.timeout);
    }
    
    return id;
  };
  
  // Добавить уведомление об успехе
  const addSuccess = (message: string, timeout?: number) => {
    return addNotification({
      type: NotificationType.SUCCESS,
      message,
      timeout
    });
  };
  
  // Добавить уведомление об ошибке
  const addError = (message: string, timeout?: number) => {
    return addNotification({
      type: NotificationType.ERROR,
      message,
      timeout
    });
  };
  
  // Добавить предупреждение
  const addWarning = (message: string, timeout?: number) => {
    return addNotification({
      type: NotificationType.WARNING,
      message,
      timeout
    });
  };
  
  // Добавить информационное уведомление
  const addInfo = (message: string, timeout?: number) => {
    return addNotification({
      type: NotificationType.INFO,
      message,
      timeout
    });
  };

  // Удалить уведомление
  const removeNotification = (id: string) => {
    const index = notifications.value.findIndex(n => n.id === id);
    if (index !== -1) {
      notifications.value.splice(index, 1);
    }
  };

  // Очистить все уведомления
  const clearNotifications = () => {
    notifications.value = [];
  };
  
  // Получить стандартное время для определенного типа уведомления
  const getDefaultTimeout = (type: NotificationType): number => {
    switch (type) {
      case NotificationType.SUCCESS:
        return 3000;
      case NotificationType.ERROR:
        return 5000;
      case NotificationType.WARNING:
        return 4000;
      case NotificationType.INFO:
        return 3000;
      default:
        return 3000;
    }
  };

  return {
    notifications,
    addNotification,
    addSuccess,
    addError,
    addWarning,
    addInfo,
    removeNotification,
    clearNotifications
  };
});
