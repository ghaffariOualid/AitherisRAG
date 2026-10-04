import React from 'react';
import { IoChevronBack, IoChevronForward } from "react-icons/io5";

/**
 * Custom resize handle with toggle button for ChatSpace panels
 */
export const CustomPanelResizeHandle = React.memo(({
  isViewerCollapsed,
  onToggle
}) => {
  return (
    <div className="group relative flex items-center justify-center w-2 mx-1 transition-colors hover:bg-blue-100 rounded data-[resize-handle-active]:bg-blue-200">
      <div className="w-1 h-12 rounded-full bg-gray-300 group-hover:bg-blue-400 group-hover:h-16 transition-all group-data-[resize-handle-active]:bg-blue-500 group-data-[resize-handle-active]:h-20" />


    </div>
  );
});

CustomPanelResizeHandle.displayName = "CustomPanelResizeHandle";
