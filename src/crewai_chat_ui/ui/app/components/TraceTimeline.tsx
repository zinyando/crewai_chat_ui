import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface TimelineSpan {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date | null;
  status: string;
  parentId?: string;
  children?: TimelineSpan[];
  depth: number;
  duration: number;
  serviceName?: string;
  operation?: string;
  tags?: Record<string, any>;
  logs?: Array<{
    timestamp: Date;
    fields: Record<string, any>;
  }>;
}

interface TraceTimelineProps {
  spans: TimelineSpan[];
  onSpanClick?: (span: TimelineSpan) => void;
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

export const TraceTimeline: React.FC<TraceTimelineProps> = ({ spans, onSpanClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!spans.length || !svgRef.current) return;

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove();

    // Sort spans by start time
    const sortedSpans = [...spans].sort((a, b) => 
      a.startTime.getTime() - b.startTime.getTime()
    );

    // Find the earliest start time and latest end time
    const minTime = d3.min(sortedSpans, d => d.startTime) as Date;
    const maxTime = d3.max(sortedSpans, d => 
      d.endTime ? d.endTime : new Date()
    ) as Date;

    // Add a small buffer to the time range
    const timeBuffer = (maxTime.getTime() - minTime.getTime()) * 0.05;
    const adjustedMinTime = new Date(minTime.getTime() - timeBuffer);
    const adjustedMaxTime = new Date(maxTime.getTime() + timeBuffer);

    // Calculate dimensions
    const margin = { top: 20, right: 30, bottom: 30, left: 100 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const rowHeight = 30;
    const height = (sortedSpans.length * rowHeight) + margin.top + margin.bottom;

    // Create scales
    const xScale = d3.scaleTime()
      .domain([adjustedMinTime, adjustedMaxTime])
      .range([0, width]);

    const yScale = d3.scaleBand()
      .domain(sortedSpans.map(d => d.id))
      .range([0, sortedSpans.length * rowHeight])
      .padding(0.1);

    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add X axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat(d3.timeFormat('%H:%M:%S') as any);

    svg.append('g')
      .attr('transform', `translate(0,${sortedSpans.length * rowHeight})`)
      .call(xAxis);

    // Add Y axis (span names)
    svg.append('g')
      .call(d3.axisLeft(yScale).tickFormat((d: any) => {
        const span = sortedSpans.find(s => s.id === d);
        return span ? span.name : '';
      }));

    // Add grid lines
    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${sortedSpans.length * rowHeight})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(10)
          .tickSize(-sortedSpans.length * rowHeight)
          .tickFormat(() => '')
      )
      .attr('stroke-opacity', 0.1);

    // Add spans as rectangles
    const bars = svg.selectAll('.bar')
      .data(sortedSpans)
      .enter()
      .append('g')
      .attr('class', 'bar')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        if (onSpanClick) onSpanClick(d);
      });

    // Add span bars
    bars.append('rect')
      .attr('x', d => xScale(d.startTime))
      .attr('y', d => yScale(d.id) || 0)
      .attr('width', d => {
        const endTime = d.endTime || new Date();
        return Math.max(xScale(endTime) - xScale(d.startTime), 3); // Minimum width of 3px
      })
      .attr('height', yScale.bandwidth())
      .attr('fill', d => getStatusColor(d.status))
      .attr('rx', 3) // Rounded corners
      .attr('ry', 3);

    // Add span labels inside bars (if there's enough space)
    bars.append('text')
      .attr('x', d => {
        const endTime = d.endTime || new Date();
        const spanWidth = xScale(endTime) - xScale(d.startTime);
        return xScale(d.startTime) + 5; // 5px padding
      })
      .attr('y', d => (yScale(d.id) || 0) + yScale.bandwidth() / 2)
      .attr('dy', '0.35em') // Vertical centering
      .attr('fill', 'white')
      .style('font-size', '10px')
      .style('pointer-events', 'none')
      .text(d => {
        const endTime = d.endTime || new Date();
        const spanWidth = xScale(endTime) - xScale(d.startTime);
        // Only show text if there's enough space
        if (spanWidth > 50) {
          const durationMs = endTime.getTime() - d.startTime.getTime();
          const durationText = durationMs < 1000 
            ? `${durationMs}ms` 
            : `${(durationMs / 1000).toFixed(1)}s`;
          return `${d.name} (${durationText})`;
        }
        return '';
      });

    // Add connecting lines for parent-child relationships
    sortedSpans.forEach(span => {
      if (span.parentId) {
        const parent = sortedSpans.find(s => s.id === span.parentId);
        if (parent) {
          svg.append('path')
            .attr('d', () => {
              const parentY = (yScale(parent.id) || 0) + yScale.bandwidth();
              const childY = yScale(span.id) || 0;
              const x = xScale(span.startTime);
              return `M${x},${parentY} L${x},${childY}`;
            })
            .attr('stroke', '#9ca3af')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3')
            .attr('fill', 'none');
        }
      }
    });

  }, [spans, onSpanClick]);

  return (
    <div className="w-full overflow-x-auto">
      <svg 
        ref={svgRef} 
        className="w-full" 
        style={{ minHeight: `${spans.length * 30 + 50}px`, minWidth: '500px' }}
      />
    </div>
  );
};

export default TraceTimeline;
