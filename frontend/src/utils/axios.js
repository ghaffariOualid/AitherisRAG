import axios from 'axios';
import useBackendStatusStore, { BACKEND_UNAVAILABLE_CODE } from '../stores/backendStatusStore';

export const BASE_URL = process.env.REACT_APP_API_URL;

const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true
});

export const axiosPrivate = axios.create({
    baseURL: BASE_URL,
    withCredentials: true
});

const isConnectionFailure = (error) => {
    if (error?.code === 'ERR_CANCELED' || error?.code === BACKEND_UNAVAILABLE_CODE) return false;
    if ([502, 503, 504].includes(error?.response?.status)) return true;
    return !error?.response && (
        error?.code === 'ERR_NETWORK' ||
        error?.code === 'ECONNABORTED' ||
        error?.code === 'ETIMEDOUT' ||
        error?.message === 'Network Error'
    );
};

const installAvailabilityGuard = (client) => {
    client.interceptors.request.use((config) => {
        const { status } = useBackendStatusStore.getState();
        if (status === 'unavailable' && !config.__allowWhileBackendUnavailable) {
            return Promise.reject(new axios.AxiosError(
                'Requests are paused while the backend is unavailable.',
                BACKEND_UNAVAILABLE_CODE,
                config,
            ));
        }
        return config;
    });

    client.interceptors.response.use(
        (response) => response,
        (error) => {
            if (isConnectionFailure(error)) {
                useBackendStatusStore.getState().markUnavailable();
            }
            return Promise.reject(error);
        },
    );
};

installAvailabilityGuard(api);
installAvailabilityGuard(axiosPrivate);

export const isBackendUnavailableError = (error) => error?.code === BACKEND_UNAVAILABLE_CODE;

export default api;
