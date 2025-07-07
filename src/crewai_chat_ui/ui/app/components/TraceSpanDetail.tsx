import React from 'react';
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

interface SpanData {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date | null;
  status: string;
  duration: number; // in milliseconds
  parentId?: string;
  children?: SpanData[];
  depth: number;
  serviceName?: string;
  operation?: string;
  tags?: Record<string, any>;
  logs?: Array<{
    timestamp: Date;
    fields: Record<string, any>;
  }>;
}

interface TraceSpanDetailProps {
  span: SpanData | null;
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
  default: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
};

const getStatusColor = (status: string): string => {
  return statusColors[status.toLowerCase()] || statusColors.default;
};

const formatTime = (timestamp: Date): string => {
  return new Intl.DateTimeFormat('default', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  }).format(timestamp);
};

const formatDuration = (ms: number): string => {
  if (ms < 1) return '0ms';
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
};

export const TraceSpanDetail: React.FC<TraceSpanDetailProps> = ({ span }) => {
  if (!span) {
    return (
      <div className="p-4 text-center text-gray-500">
        Select a span to view details
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center">
              <span>{span.name}</span>
              <Badge className={`ml-2 ${getStatusColor(span.status)}`}>
                {span.status}
              </Badge>
            </div>
            <div className="text-sm font-normal">
              {formatDuration(span.duration)}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-500">Span ID</div>
            <div className="font-mono">{span.id}</div>
            
            {span.parentId && (
              <>
                <div className="text-gray-500">Parent ID</div>
                <div className="font-mono">{span.parentId}</div>
              </>
            )}
            
            {span.serviceName && (
              <>
                <div className="text-gray-500">Service</div>
                <div>{span.serviceName}</div>
              </>
            )}
            
            {span.operation && (
              <>
                <div className="text-gray-500">Operation</div>
                <div>{span.operation}</div>
              </>
            )}
            
            <div className="text-gray-500">Start Time</div>
            <div>{formatTime(span.startTime)}</div>
            
            {span.endTime && (
              <>
                <div className="text-gray-500">End Time</div>
                <div>{formatTime(span.endTime)}</div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Tags/Attributes */}
      {span.tags && Object.keys(span.tags).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(span.tags).map(([key, value]) => (
                <React.Fragment key={key}>
                  <div className="text-gray-500">{key}</div>
                  <div className="font-mono break-all">
                    {typeof value === 'object' 
                      ? JSON.stringify(value, null, 2) 
                      : String(value)}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Logs */}
      {span.logs && span.logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {span.logs.map((log, idx) => (
                <div key={idx} className="border rounded-md p-2">
                  <div className="text-xs text-gray-500 mb-1">
                    {formatTime(log.timestamp)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(log.fields).map(([key, value]) => (
                      <React.Fragment key={key}>
                        <div className="text-gray-500">{key}</div>
                        <div className="font-mono break-all">
                          {typeof value === 'object' 
                            ? JSON.stringify(value, null, 2) 
                            : String(value)}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TraceSpanDetail;
