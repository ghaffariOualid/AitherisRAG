import { useState, useEffect, useCallback } from 'react';
import useAxiosPrivate from './useAxiosPrivate';

const useFetch = (url) => {
  const axiosInstance = useAxiosPrivate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get(url);
      setData(response.data);
    } catch (err) {
      setError(err);
      setData(null);
      // Consumers receive the error in state. Throwing from the effect that
      // calls this hook creates an unhandled rejection when the API is down.
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [axiosInstance, url]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, error, isLoading, fetchData };
};

export default useFetch;
