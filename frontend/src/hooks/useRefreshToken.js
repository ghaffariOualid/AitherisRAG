import axios from "../utils/axios";
import useAuthStore from "../stores/authStore";
import { useNavigate } from "react-router-dom";
import { useCallback } from "react";

// Several requests can receive a 401 at the same time during page load. Keep
// one shared refresh request so token rotation cannot invalidate its siblings.
let refreshInFlight = null;

export const useRefreshToken = () =>  {
  const setToken = useAuthStore((state) => state.setToken);
  const navigateTo = useNavigate();

  return useCallback(() => {
    if (!refreshInFlight) {
      refreshInFlight = axios.get('/api/auth/token_refresh', {
        withCredentials: true,
      })
        .then((response) => {
          const accessToken = response.data.access_token;
          setToken(accessToken);

          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            const user = JSON.parse(storedUser);
            localStorage.setItem('user', JSON.stringify({ ...user, access_token: accessToken }));
          }

          return accessToken;
        })
        .catch((error) => {
          if (error.response?.status === 401) {
            navigateTo('/user/login', { replace: true });
          }
          throw error;
        })
        .finally(() => {
          refreshInFlight = null;
        });
    }

    return refreshInFlight;
  }, [navigateTo, setToken]);
};
