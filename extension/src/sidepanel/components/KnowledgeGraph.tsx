// Revolutionary Feature: Personal Knowledge Graph
// Every scan becomes a node. Related scans auto-connect based on semantic similarity.
// Visualized as an interactive D3 force graph.

import React, { useEffect, useRef, useCallback } from 'react';
import type { KnowledgeNode, KnowledgeEdge } from '../../shared/types';
import { CONTENT_TYPE_ICONS } from '../../shared/constants';

interface KnowledgeGraphProps {
  nodes: KnowledgeNode[];
  onNodeClick: (node: KnowledgeNode) => void;
  highlightedId?: string;
}

type D3Node = KnowledgeNode & { x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null };
type D3Link = { source: D3Node; target: D3Node; strength: number; label: string };

export function KnowledgeGraph({ nodes, onNodeClick, highlightedId }: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<unknown>(null);

  const buildGraph = useCallback(async () => {
    if (!svgRef.current || nodes.length === 0) return;
    const d3 = await import('d3');
    const svg = d3.select(svgRef.current);
    const W = svgRef.current.clientWidth;
    const H = svgRef.current.clientHeight;

    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 16).attr('refY', 5)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', '#3d43ca');

    const g = svg.append('g');

    // Build links from edge definitions
    const links: D3Link[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n as D3Node]));

    nodes.forEach(node => {
      node.connections.forEach(edge => {
        const target = nodeMap.get(edge.targetId);
        if (target && edge.strength > 0.4) {
          links.push({
            source: node as D3Node,
            target,
            strength: edge.strength,
            label: edge.label,
          });
        }
      });
    });

    // Simulation
    const simulation = d3.forceSimulation(nodes as D3Node[])
      .force('link', d3.forceLink<D3Node, D3Link>(links)
        .id(d => d.id)
        .distance(d => 100 - d.strength * 50)
        .strength(d => d.strength * 0.5))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(24));

    simulationRef.current = simulation;

    // Edges
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#2b2d48')
      .attr('stroke-width', d => d.strength * 2)
      .attr('marker-end', 'url(#arrow)');

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes as D3Node[])
      .enter().append('g')
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => onNodeClick(d as KnowledgeNode))
      .call(d3.drag<SVGGElement, D3Node>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }));

    node.append('circle')
      .attr('r', d => d.id === highlightedId ? 18 : 14)
      .attr('fill', d => d.id === highlightedId ? '#6175f1' : '#22243a')
      .attr('stroke', d => d.id === highlightedId ? '#a5bffc' : '#2b2d48')
      .attr('stroke-width', 2);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 12)
      .text(d => CONTENT_TYPE_ICONS[d.contentType] ?? '🔍');

    node.append('title').text(d => d.title);

    // Labels
    node.append('text')
      .attr('y', 22)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', '#6b7280')
      .text(d => d.title.slice(0, 12) + (d.title.length > 12 ? '…' : ''));

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as D3Node).x!)
        .attr('y1', d => (d.source as D3Node).y!)
        .attr('x2', d => (d.target as D3Node).x!)
        .attr('y2', d => (d.target as D3Node).y!);
      node.attr('transform', d => `translate(${d.x!},${d.y!})`);
    });

    // Pan + zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', event => g.attr('transform', event.transform));
    svg.call(zoom);
  }, [nodes, onNodeClick, highlightedId]);

  useEffect(() => {
    buildGraph();
    return () => {
      // Clean up simulation on unmount
    };
  }, [buildGraph]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <div className="text-3xl mb-2">🕸️</div>
        <div className="text-sm text-surface-4">Your knowledge graph is empty.</div>
        <div className="text-xs text-surface-4 mt-1">
          Every scan becomes a node. Scan more to build connections.
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-64 bg-surface-0 rounded-xl border border-surface-3 overflow-hidden">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute bottom-2 right-2 text-xs text-surface-4">
        Scroll to zoom · Drag to pan
      </div>
    </div>
  );
}
