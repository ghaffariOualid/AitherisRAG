import { create } from 'zustand';

export const BACKEND_UNAVAILABLE_CODE = 'ERR_BACKEND_UNAVAILABLE';

const useBackendStatusStore = create((set) => ({
  status: 'available',
  markAvailable: () => set({ status: 'available' }),
  markUnavailable: () => set({ status: 'unavailable' }),
  markChecking: () => set({ status: 'checking' }),
}));

export default useBackendStatusStore;
