import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface SpanData {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date | null;
  status: string;
  duration: number; // in milliseconds
  parentId?: string;
  children: SpanData[];
  depth: number;
  serviceName?: string;
  operation?: string;
}

interface TraceSpanViewProps {
  spans: SpanData[];
  totalDuration: number;
  onSpanClick?: (span: SpanData) => void;
}

const statusColors: Record<string, string> = {
  completed: '#22c55e', // green
  running: '#3b82f6',   // blue
  pending: '#f59e0b',   // amber
  failed: '#ef4444',    // red
  default: '#6b7280',   // gray
};

const getStatusColor = (status: string): string => {
  return statusColors[status.toLowerCase()] || statusColors.default;
};

const formatDuration = (ms: number): string => {
  if (ms < 1) return '0ms';
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
};

const SpanRow: React.FC<{
  span: SpanData;
  totalDuration: number;
  onSpanClick?: (span: SpanData) => void;
  level: number;
}> = ({ span, totalDuration, onSpanClick, level }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = span.children && span.children.length > 0;
  
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };
  
  const handleClick = () => {
    if (onSpanClick) onSpanClick(span);
  };

  // Calculate position and width for the span bar
  const startPercent = (span.startTime.getTime() / totalDuration) * 100;
  const endPercent = span.endTime 
    ? (span.endTime.getTime() / totalDuration) * 100 
    : 100;
  const widthPercent = Math.max(endPercent - startPercent, 0.5); // Minimum width

  return (
    <>
      <div 
        className="flex items-center hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-b border-gray-100 dark:border-gray-800"
        onClick={handleClick}
      >
        {/* Indentation and expand/collapse button */}
        <div className="flex items-center" style={{ width: '250px', paddingLeft: `${level * 16}px` }}>
          {hasChildren && (
            <button 
              onClick={handleToggle} 
              className="p-1 mr-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
          {!hasChildren && <div className="w-6" />}
          
          <div className="truncate font-mono text-sm">
            {span.serviceName && (
              <span className="text-gray-500 mr-1">{span.serviceName}</span>
            )}
            <span>{span.name}</span>
          </div>
        </div>
        
        {/* Timeline visualization */}
        <div className="flex-1 relative h-6 bg-gray-100 dark:bg-gray-800">
          <div 
            className="absolute h-full" 
            style={{ 
              left: `${startPercent}%`, 
              width: `${widthPercent}%`,
              backgroundColor: getStatusColor(span.status),
              borderRadius: '2px'
            }}
          />
        </div>
        
        {/* Duration */}
        <div className="w-24 text-right pr-4 text-sm font-mono">
          {formatDuration(span.duration)}
        </div>
      </div>
      
      {/* Render children if expanded */}
      {expanded && hasChildren && span.children?.map(child => (
        <SpanRow 
          key={child.id} 
          span={child} 
          totalDuration={totalDuration}
          onSpanClick={onSpanClick}
          level={level + 1}
        />
      ))}
    </>
  );
};

export const TraceSpanView: React.FC<TraceSpanViewProps> = ({ 
  spans, 
  totalDuration,
  onSpanClick 
}) => {
  // Filter root spans (those without parents or with parents outside the current trace)
  const rootSpans = spans.filter(span => !span.parentId || !spans.find(s => s.id === span.parentId));
  
  return (
    <div className="w-full overflow-x-auto border rounded-md">
      {/* Header */}
      <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-2 border-b font-medium text-sm">
        <div style={{ width: '250px' }}>Service & Operation</div>
        <div className="flex-1">Timeline</div>
        <div className="w-24 text-right pr-4">Duration</div>
      </div>
      
      {/* Spans */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {rootSpans.map(span => (
          <SpanRow 
            key={span.id} 
            span={span} 
            totalDuration={totalDuration}
            onSpanClick={onSpanClick}
            level={0}
          />
        ))}
      </div>
    </div>
  );
};

export default TraceSpanView;
