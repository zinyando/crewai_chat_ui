import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

// Enhanced TimelineSpan to include children for hierarchy
interface TimelineSpan {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date | null;
  status: string;
  parentId?: string;
  children: TimelineSpan[];
  depth: number;
  duration: number;
  serviceName?: string;
  operation?: string;
}

interface TraceTimelineProps {
  spans: TimelineSpan[];
  onSpanClick?: (span: TimelineSpan) => void;
}

const getBarColor = (span: TimelineSpan): string => {
  const service = span.serviceName?.toLowerCase() || "";
  if (service.includes("crew")) return "#a855f7"; // purple
  if (service.includes("agent")) return "#22c55e"; // green
  if (service.includes("task")) return "#3b82f6"; // blue
  return "#6b7280"; // gray for others
};

// A simple icon for agents/crew
const UserIcon = (color: string) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
  </svg>
`;

export const TraceTimeline: React.FC<TraceTimelineProps> = ({
  spans,
  onSpanClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [expandedSpans, setExpandedSpans] = useState<Record<string, boolean>>(
    {}
  );

  // Build a tree and a flat list of visible spans
  const visibleSpans = useMemo(() => {
    const spanMap: Record<string, TimelineSpan> = {};
    spans.forEach((s) => {
      spanMap[s.id] = { ...s, children: [], depth: 0 };
    });

    const roots: TimelineSpan[] = [];
    spans.forEach((s) => {
      if (s.parentId && spanMap[s.parentId]) {
        spanMap[s.parentId].children.push(spanMap[s.id]);
      } else {
        roots.push(spanMap[s.id]);
      }
    });

    // Set initial expansion state
    if (Object.keys(expandedSpans).length === 0 && spans.length > 0) {
      const initialExpanded: Record<string, boolean> = {};
      spans.forEach((s) => {
        if (s.children && s.children.length > 0) {
          initialExpanded[s.id] = true; // Expand all by default
        }
      });
      setExpandedSpans(initialExpanded);
    }

    const flatten = (nodes: TimelineSpan[], depth = 0): TimelineSpan[] => {
      return nodes.reduce((acc, node) => {
        node.depth = depth;
        acc.push(node);
        if (expandedSpans[node.id] && node.children) {
          acc.push(...flatten(node.children, depth + 1));
        }
        return acc;
      }, [] as TimelineSpan[]);
    };

    return flatten(roots);
  }, [spans, expandedSpans]);

  const toggleExpand = (spanId: string) => {
    setExpandedSpans((prev) => ({ ...prev, [spanId]: !prev[spanId] }));
  };

  useEffect(() => {
    if (!visibleSpans.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 30, bottom: 40, left: 250 };
    const rowHeight = 42;
    const height = visibleSpans.length * rowHeight + margin.top + margin.bottom;
    const width =
      (svgRef.current.parentElement?.clientWidth || 800) -
      margin.left -
      margin.right;

    svg
      .attr("width", width + margin.left + margin.right)
      .attr("height", height);
    const chart = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const minTime = d3.min(visibleSpans, (d) => d.startTime) as Date;
    const maxTime = d3.max(
      visibleSpans,
      (d) => d.endTime || new Date()
    ) as Date;

    const xScale = d3.scaleTime().domain([minTime, maxTime]).range([0, width]);

    // X-axis
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(5)
      .tickFormat((d) => `${(d.valueOf() - minTime.valueOf()) / 1000}s`);

    svg
      .append("g")
      .attr(
        "transform",
        `translate(${margin.left}, ${height - margin.bottom + 5})`
      )
      .call(xAxis)
      .attr("color", "#6b7280");

    // Rows
    const rows = chart
      .selectAll(".row")
      .data(visibleSpans, (d: any) => d.id)
      .enter()
      .append("g")
      .attr("class", "row")
      .attr("transform", (d, i) => `translate(0, ${i * rowHeight})`)
      .style("cursor", "pointer")
      .on("click", (event, d) => onSpanClick?.(d));

    // Bars
    rows
      .append("rect")
      .attr("x", (d) => xScale(d.startTime))
      .attr("width", (d) => {
        const w = xScale(d.endTime || new Date()) - xScale(d.startTime);
        return Math.max(w, 2);
      })
      .attr("height", rowHeight - 12)
      .attr("y", 6)
      .attr("fill", (d) => getBarColor(d))
      .attr("rx", 4)
      .attr("ry", 4);

    // Duration text on bars
    rows
      .append("text")
      .attr("x", (d) => xScale(d.endTime || new Date()) - 5)
      .attr("y", rowHeight / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("fill", "white")
      .style("font-size", "12px")
      .text((d) => `${d.duration.toFixed(2)}s`);

    // Labels on the left
    const labels = svg
      .append("g")
      .attr("transform", `translate(0, ${margin.top})`)
      .selectAll(".label")
      .data(visibleSpans, (d: any) => d.id)
      .enter()
      .append("g")
      .attr("class", "label")
      .attr("transform", (d, i) => `translate(0, ${i * rowHeight})`);

    // Toggle expand/collapse
    labels
      .append("g")
      .attr("transform", (d) => `translate(${d.depth * 20}, 0)`)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        if (d.children.length > 0) toggleExpand(d.id);
      })
      .html((d) => {
        if (d.children.length === 0) return "";
        const rotation = expandedSpans[d.id] ? 90 : 0;
        return `<svg width="16" height="${rowHeight}" viewBox="0 0 16 16"><path transform="translate(8, ${
          rowHeight / 2
        }) rotate(${rotation})" d="M-3 4 L3 0 L-3 -4" fill="#6b7280"></path></svg>`;
      });

    // Icon
    labels
      .append("g")
      .attr(
        "transform",
        (d) => `translate(${d.depth * 20 + 15}, ${(rowHeight - 14) / 2})`
      )
      .html((d) => {
        const service = d.serviceName?.toLowerCase() || "";
        if (service.includes("crew") || service.includes("agent")) {
          return UserIcon(getBarColor(d));
        }
        return "";
      });

    // Span name
    labels
      .append("text")
      .attr("x", (d) => d.depth * 20 + 35)
      .attr("y", rowHeight / 2)
      .attr("dy", "0.35em")
      .attr("fill", "#1f2937")
      .text((d) => d.name)
      .each(function (d) {
        const self = d3.select(this);
        const textNode = self.node();
        if (!textNode) return;

        const startX = d.depth * 20 + 35;
        const availableWidth = margin.left - startX - 15; // 15px padding

        let text = d.name;
        while (textNode.getBBox().width > availableWidth && text.length > 3) {
          text = text.slice(0, -1);
          self.text(text + "...");
        }
      });
  }, [visibleSpans, onSpanClick, expandedSpans, toggleExpand]);

  return (
    <div className="w-full overflow-x-auto bg-white rounded-lg p-4">
      <svg ref={svgRef} className="w-full" style={{ minWidth: "800px" }} />
    </div>
  );
};

export default TraceTimeline;
