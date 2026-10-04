import React, { createContext, useContext, useState, useCallback } from 'react';
import { HiCheckCircle, HiXCircle, HiInformationCircle, HiExclamation } from 'react-icons/hi';
import useBackendStatusStore from '../../stores/backendStatusStore';

const ToastContext = createContext(null);

// Toast types configuration
const TOAST_TYPES = {
  success: {
    icon: HiCheckCircle,
    iconColor: 'text-emerald-500'
  },
  error: {
    icon: HiXCircle,
    iconColor: 'text-red-500'
  },
  warning: {
    icon: HiExclamation,
    iconColor: 'text-amber-500'
  },
  info: {
    icon: HiInformationCircle,
    iconColor: 'text-blue-500'
  }
};

// Individual Toast Component
const Toast = ({ id, type, message, title, onRemove }) => {
  const config = TOAST_TYPES[type] || TOAST_TYPES.info;
  const Icon = config.icon;

  return (
    <div
      className={`
        relative overflow-hidden
        flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4
        text-slate-600 shadow-[0_12px_28px_-18px_rgba(15,23,42,0.45)]
        animate-slide-in
        min-w-[320px] max-w-[420px]
      `}
      role={type === 'error' ? 'alert' : 'status'}
    >
      {/* Icon */}
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        {title && (
          <p className="text-sm font-semibold text-slate-800">
            {title}
          </p>
        )}
        <p className={`text-sm leading-5 text-slate-500 ${title ? 'mt-0.5' : ''}`}>
          {message}
        </p>
      </div>

      {/* Close Button */}
      <button
        onClick={() => onRemove(id)}
        className="flex-shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label="Fermer la notification"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

// Toast Container Component
const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-3">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onRemove={removeToast}
        />
      ))}
    </div>
  );
};

// Toast Provider Component
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const backendStatus = useBackendStatusStore((state) => state.status);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(({ type = 'info', message, title, duration = 3000 }) => {
    if (useBackendStatusStore.getState().status === 'unavailable') return null;
    const id = Date.now() + Math.random();
    
    setToasts((prev) => [...prev, { id, type, message, title, duration }]);

    // Auto remove after duration
    setTimeout(() => {
      removeToast(id);
    }, duration);

    return id;
  }, [removeToast]);

  React.useEffect(() => {
    if (backendStatus !== 'unavailable') return;

    const id = Date.now() + Math.random();
    setToasts([{
      id,
      type: 'warning',
      title: 'Service temporairement indisponible',
      message: 'Cette action nécessite le backend, qui est actuellement hors ligne. Les nouvelles requêtes sont mises en pause.',
      duration: 7000,
    }]);

    const timeoutId = setTimeout(() => removeToast(id), 7000);
    return () => clearTimeout(timeoutId);
  }, [backendStatus, removeToast]);

  // Convenience methods
  const toast = {
    success: (message, title) => addToast({ type: 'success', message, title }),
    error: (message, title) => addToast({ type: 'error', message, title }),
    warning: (message, title) => addToast({ type: 'warning', message, title }),
    info: (message, title) => addToast({ type: 'info', message, title }),
    custom: addToast
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {/* Inject animations via style tag */}
      <style>{`
        @keyframes slide-in-bottom {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        .animate-slide-in {
          animation: slide-in-bottom 0.3s ease-out forwards;
        }
      `}</style>
    </ToastContext.Provider>
  );
};

// Custom hook to use toast
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastProvider;
