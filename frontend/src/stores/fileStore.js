import { create } from 'zustand';

const useFileStore = create((set, get) => ({
  handleUpload: async (selectedFile, axiosInstance) => {
    if (!selectedFile) {
      return { error: "No file selected." };
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    
    try {
      const response = await axiosInstance.post('/api/document/upload', formData);
      return response;
    } catch (error) {
      throw error;
    }
  },

  // Upload sequentially so a large selection remains predictable and does not
  // burst through the API rate limit. Individual failures do not stop later
  // files in the same selection from being uploaded.
  handleUploads: async (selectedFiles, axiosInstance, onProgress) => {
    const files = Array.from(selectedFiles || []).filter(Boolean);
    const results = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      onProgress?.({
        current: index + 1,
        total: files.length,
        file,
        response: null,
        error: null,
        isUploading: true,
      });
      try {
        const response = await get().handleUpload(file, axiosInstance);
        const result = { file, response, error: null, isUploading: false };
        results.push(result);
        onProgress?.({ current: index + 1, total: files.length, ...result });
      } catch (error) {
        const result = { file, response: null, error, isUploading: false };
        results.push(result);
        onProgress?.({ current: index + 1, total: files.length, ...result });
      }
    }

    return results;
  },
}));

export default useFileStore;
