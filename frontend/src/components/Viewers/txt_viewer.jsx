import React, { useState, useEffect } from "react";
import Loading from "../ui/Loading";

function TxtViewer({ url }) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDataFromUrl = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(url);
        const text = await response.text();
        setContent(text);
      } catch (error) {
        setContent("Error loading file content.");
      } finally {
        setIsLoading(false);
      }
    };

    if (url) {
      fetchDataFromUrl();
    }
  }, [url]);

  return (
    <div className="relative flex h-full min-h-0 max-h-full flex-col overflow-hidden rounded-sm2 border bg-white">
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <Loading padding={3} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

export default TxtViewer;
