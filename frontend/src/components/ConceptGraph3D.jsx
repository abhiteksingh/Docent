import { useEffect, useRef, useState } from 'react';
import API_BASE from '../api';

function ConceptGraph3D({ chatId, chats, messages, workspaceType, onSelectNode, heatmap = [], highlightedTopic = null, onGradeNode = null }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [is3D, setIs3D] = useState(false);
  const [rawNodes, setRawNodes] = useState([]);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [canvasDraggable, setCanvasDraggable] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // all | again | good | easy

  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const activeEdgesRef = useRef([]);
  const draggedNodeRef = useRef(null);
  const hoveredNodeRef = useRef(null);

  const normString = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, '');

  // Calculate coordinates dynamically when layout toggles, nodes load, or filters change
  useEffect(() => {
    if (rawNodes.length === 0) return;

    let nodesToUse = rawNodes;
    let edgesToUse = edgesRef.current || [];

    // 1. Spaced Learning workspace filtering by heatmap (matching concepts)
    if (workspaceType === "study" && heatmap && heatmap.length > 0) {
      nodesToUse = rawNodes.filter(node => {
        const cleanTopic = normString(node.label.split(': ').pop());
        return heatmap.some(h => {
          const normH = normString(h.name);
          return cleanTopic.includes(normH) || normH.includes(cleanTopic);
        });
      });
      if (nodesToUse.length === 0) nodesToUse = rawNodes; // Fallback to all nodes if filter yields empty
    }

    // 2. Grade filtering by filterMode ('again' | 'good' | 'easy')
    if (workspaceType === "study" && heatmap && heatmap.length > 0 && filterMode !== 'all') {
      const modeLevelMap = {
        again: 'LOW',
        good: 'MEDIUM',
        easy: 'HIGH'
      };
      const targetLevel = modeLevelMap[filterMode];

      nodesToUse = nodesToUse.filter(node => {
        const cleanTopic = normString(node.label.split(': ').pop());
        const match = heatmap.find(h => {
          const normH = normString(h.name);
          return cleanTopic.includes(normH) || normH.includes(cleanTopic);
        });
        return match && match.level === targetLevel;
      });
    }

    // Map original IDs to new indices
    const originalIdMap = {};
    nodesToUse.forEach((n, newIdx) => {
      originalIdMap[n.id] = newIdx;
    });

    // Re-map edges, keeping only edges between remaining nodes
    const filteredEdges = [];
    edgesToUse.forEach(e => {
      if (e.source in originalIdMap && e.target in originalIdMap) {
        filteredEdges.push({
          source: originalIdMap[e.source],
          target: originalIdMap[e.target]
        });
      }
    });

    // Fallback simple chain if edges are empty
    if (filteredEdges.length === 0 && nodesToUse.length > 1) {
      for (let i = 0; i < nodesToUse.length - 1; i++) {
        filteredEdges.push({ source: i, target: i + 1 });
      }
    }

    // Ensure every node is connected (prevent isolated/floating nodes)
    const connectedNodes = new Set();
    filteredEdges.forEach(e => {
      connectedNodes.add(e.source);
      connectedNodes.add(e.target);
    });

    for (let i = 0; i < nodesToUse.length; i++) {
      if (!connectedNodes.has(i)) {
        if (i > 0) {
          filteredEdges.push({ source: i - 1, target: i });
        } else if (nodesToUse.length > 1) {
          filteredEdges.push({ source: 0, target: 1 });
        }
      }
    }
    edgesToUse = filteredEdges;

    // Reset coordinates and format nodes
    const numNodes = nodesToUse.length;
    nodesRef.current = nodesToUse.map((node, i) => {
      let x, y, z;
      if (is3D) {
        const phi = Math.acos(-1 + (2 * i) / numNodes);
        const theta = Math.sqrt(numNodes * Math.PI) * phi;
        const r = 60;
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.sin(phi) * Math.sin(theta);
        z = r * Math.cos(phi);
      } else {
        const angle = (2 * Math.PI * i) / numNodes;
        const r = 70;
        x = r * Math.cos(angle);
        y = r * Math.sin(angle);
        z = 0;
      }

      return {
        id: i, // Map to index for physics engine
        x, y, z,
        vx: 0, vy: 0, vz: 0,
        projX: 0, projY: 0, projRadius: 0,
        label: node.label,
        page: node.page,
        filename: node.filename,
        text: node.text
      };
    });

    activeEdgesRef.current = edgesToUse;
  }, [rawNodes, is3D, heatmap, workspaceType, filterMode]);

  // Load dynamic concept tree from backend API - depends ONLY on chatId
  useEffect(() => {
    let active = true;
    const fetchTree = async () => {
      try {
        const response = await fetch(`${API_BASE}/chats/${chatId}/concept-tree`);
        if (!response.ok) throw new Error("Failed to fetch");
        const data = await response.json();

        if (!active) return;

        if (data.nodes && data.nodes.length > 0) {
          // Client-side strict canonical deduplication
          const uniqueNodes = [];
          const seenTopics = new Set();
          const normStr = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, '');

          data.nodes.forEach(node => {
            const topic = normStr(node.label.split(': ').pop());
            let isDup = false;
            for (let seen of seenTopics) {
              if (seen === topic || (seen.length > 3 && topic.length > 3 && (seen.includes(topic) || topic.includes(seen)))) {
                isDup = true;
                break;
              }
            }
            if (!isDup && topic) {
              seenTopics.add(topic);
              uniqueNodes.push(node);
            }
          });

          setRawNodes(uniqueNodes);
          edgesRef.current = data.edges || [];
          return;
        }
      } catch (err) {
        console.error("Concept tree fetch failed, falling back to mock topics:", err);
      }

      // Fallback mock topics if fetch fails or is empty
      if (!active) return;

      const topics = [
        { id: 0, label: "Document Abstract", page: 1, text: "The abstract summarizes the document overview and core thesis statements." },
        { id: 1, label: "Introduction", page: 2, text: "Section 1 provides historical context and initial research directives." },
        { id: 2, label: "Core Content", page: 3, text: "Detailed discussion of systems implementation, parameters, and algorithms." },
        { id: 3, label: "Results & Testing", page: 4, text: "Experimental outcomes showing performance graphs and score tables." },
        { id: 4, label: "Summary Outline", page: 5, text: "Final summary outlining core conclusions, references, and next steps." }
      ];

      const fallbackEdges = [];
      for (let i = 0; i < topics.length; i++) {
        fallbackEdges.push({ source: i, target: (i + 1) % topics.length });
        if (i > 1) {
          fallbackEdges.push({ source: i, target: (i + 2) % topics.length });
        }
      }

      setRawNodes(topics);
      edgesRef.current = fallbackEdges;
    };

    fetchTree();
    return () => {
      active = false;
    };
  }, [chatId]);



  // Handle WebGL/Canvas rendering loops with physics simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const themeColors = {
      study: '#4C8DFF',
      audit: '#FF4C4C',
      insight: '#3ECF8E',
      career: '#FFC107',
      chat: '#4C8DFF'
    };
    const workspaceAccent = themeColors[workspaceType] || '#4C8DFF';

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Clear canvas
      ctx.fillStyle = isStudy ? '#F8FAFC' : '#0D0D0D';
      ctx.fillRect(0, 0, width, height);

      // --- Spring Physics Simulation ---

      // 1. Spring attraction/repulsion on connected edges
      activeEdgesRef.current.forEach(edge => {
        const source = nodesRef.current[edge.source];
        const target = nodesRef.current[edge.target];
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dz = target.z - source.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const restLength = 95;
          const k = 0.03;
          const force = (dist - restLength) * k;

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          const fz = (dz / dist) * force;

          source.vx += fx;
          source.vy += fy;
          source.vz += fz;
          target.vx -= fx;
          target.vy -= fy;
          target.vz -= fz;
        }
      });

      // 2. Multi-body charge repulsion between nodes
      const activeCount = nodesRef.current.length;
      for (let i = 0; i < activeCount; i++) {
        for (let j = i + 1; j < activeCount; j++) {
          const nodeA = nodesRef.current[i];
          const nodeB = nodesRef.current[j];
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const dz = nodeB.z - nodeA.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

          // Increase repulsion if nodes have visible labels to prevent text clumping/overlapping
          const hasLabelA = workspaceType === "study" && heatmap && heatmap.some(h => nodeA.label.toLowerCase().includes(h.name.toLowerCase()));
          const hasLabelB = workspaceType === "study" && heatmap && heatmap.some(h => nodeB.label.toLowerCase().includes(h.name.toLowerCase()));
          const minDistance = (hasLabelA || hasLabelB) ? 145 : 85;

          if (dist < minDistance) {
            const force = (minDistance - dist) * 0.08;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            const fz = (dz / dist) * force;

            nodeA.vx -= fx;
            nodeA.vy -= fy;
            nodeA.vz -= fz;
            nodeB.vx += fx;
            nodeB.vy += fy;
            nodeB.vz += fz;
          }
        }
      }

      // 3. Gentle gravity pull towards center of canvas to keep graph bound
      nodesRef.current.forEach(node => {
        node.vx -= node.x * 0.012;
        node.vy -= node.y * 0.012;
        node.vz -= node.z * 0.012;
      });

      // 4. Euler integration & friction to update coordinates
      nodesRef.current.forEach(node => {
        if (node === draggedNodeRef.current) {
          node.vx = 0;
          node.vy = 0;
          node.vz = 0;
          return;
        }
        node.vx *= 0.82;
        node.vy *= 0.82;
        node.vz *= 0.82;

        node.x += node.vx;
        node.y += node.vy;
        node.z += is3D ? node.vz : 0;
      });

      // 5. Rotate nodes slowly in 3D (only when not dragging)
      if (is3D && !draggedNodeRef.current) {
        const angleY = 0.003;
        const angleX = 0.0018;
        const cosY = Math.cos(angleY), sinY = Math.sin(angleY);
        const cosX = Math.cos(angleX), sinX = Math.sin(angleX);

        nodesRef.current.forEach(node => {
          if (node === draggedNodeRef.current) return;
          const x1 = node.x * cosY - node.z * sinY;
          const z1 = node.z * cosY + node.x * sinY;
          const y2 = node.y * cosX - z1 * sinX;
          const z2 = z1 * cosX + node.y * sinX;
          node.x = x1;
          node.y = y2;
          node.z = z2;
        });
      }

      // 6. Project coordinates to screen
      nodesRef.current.forEach(node => {
        if (is3D) {
          const focalLength = 300;
          const scale = focalLength / (focalLength + node.z);
          node.projX = width / 2 + node.x * scale;
          node.projY = height / 2 + node.y * scale;
          node.projRadius = 8 * scale;
        } else {
          node.projX = width / 2 + node.x;
          node.projY = height / 2 + node.y;
          node.projRadius = 8;
        }
      });

      // Draw edges (lines between nodes)
      ctx.lineWidth = 1;
      activeEdgesRef.current.forEach(edge => {
        const source = nodesRef.current[edge.source];
        const target = nodesRef.current[edge.target];

        if (source && target) {
          const avgZ = (source.z + target.z) / 2;
          const opacity = is3D ? Math.max(0.1, 1 - (avgZ + 80) / 160) : 0.8;
          ctx.strokeStyle = isStudy
            ? `rgba(76, 141, 255, ${opacity * 0.18})`
            : `rgba(255, 255, 255, ${opacity * 0.12})`;
          ctx.beginPath();
          ctx.moveTo(source.projX, source.projY);
          ctx.lineTo(target.projX, target.projY);
          ctx.stroke();
        }
      });

      // Draw nodes
      nodesRef.current.forEach(node => {
        const opacity = is3D ? Math.max(0.2, 1 - (node.z + 80) / 160) : 0.95;
        const topicLabel = node.label.split(': ').pop();

        let accentColor = workspaceAccent;
        let glowColor = null;

        let masteryLabel = '';
        if (workspaceType === "study" && heatmap && heatmap.length > 0) {
          const match = heatmap.find(h =>
            node.label.toLowerCase().includes(h.name.toLowerCase()) ||
            h.name.toLowerCase().includes(node.label.toLowerCase())
          );
          if (match) {
            accentColor = match.color;
            const performance = match.measured_performance !== undefined ? match.measured_performance : 0.8;
            const isOverconfident = match.level === "HIGH" && performance < 0.6;
            const isUnderestimating = match.level === "LOW" && performance > 0.8;

            if (isOverconfident) {
              glowColor = '#EF4444';
            } else if (isUnderestimating) {
              glowColor = '#6366F1';
            }

            masteryLabel = topicLabel;
          }
        }

        // Draw outer audited warning glow if active
        if (glowColor) {
          const pulse = 1 + 0.18 * Math.sin(Date.now() * 0.006);
          ctx.fillStyle = `${glowColor}1A`;
          ctx.beginPath();
          ctx.arc(node.projX, node.projY, node.projRadius * 2.6 * pulse, 0, 2 * Math.PI);
          ctx.fill();

          ctx.strokeStyle = `${glowColor}40`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Draw outer glow if hovered or selected
        const isHovered = hoveredNodeRef.current && hoveredNodeRef.current.id === node.id;
        const isSelected = isHovered || (draggedNodeRef.current && draggedNodeRef.current.id === node.id);
        if (isSelected) {
          ctx.fillStyle = `${accentColor}25`;
          ctx.beginPath();
          ctx.arc(node.projX, node.projY, node.projRadius * 2.3, 0, 2 * Math.PI);
          ctx.fill();
        }

        // Draw double-ring highlight if connected to the active recall stack card
        const isCardHighlighted = highlightedTopic && topicLabel.toLowerCase().includes(highlightedTopic.toLowerCase());
        if (isCardHighlighted) {
          const pulse = 1 + 0.14 * Math.sin(Date.now() * 0.007);
          ctx.strokeStyle = '#4C8DFF';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(node.projX, node.projY, node.projRadius * 1.9 * pulse, 0, 2 * Math.PI);
          ctx.stroke();

          ctx.strokeStyle = 'rgba(76, 141, 255, 0.45)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(node.projX, node.projY, node.projRadius * 2.5 * pulse, 0, 2 * Math.PI);
          ctx.stroke();
        }

        // Draw node dot
        const grad = ctx.createRadialGradient(
          node.projX - node.projRadius * 0.3,
          node.projY - node.projRadius * 0.3,
          1,
          node.projX,
          node.projY,
          node.projRadius
        );
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.3, accentColor);
        grad.addColorStop(1, isStudy ? '#D2CFC9' : '#0A0A0A');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(node.projX, node.projY, node.projRadius, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = isStudy ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Draw labels showing green, yellow, red categories
        if (!is3D || node.z < 25) {
          ctx.fillStyle = isStudy
            ? `rgba(15, 23, 42, ${opacity * 0.95})`
            : `rgba(255, 255, 255, ${opacity * 0.9})`;
          ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'left';

          const textToDraw = isStudy ? masteryLabel : topicLabel;
          ctx.fillText(textToDraw, node.projX + node.projRadius + 6, node.projY + 3);
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [workspaceType, is3D, heatmap]);

  // Resize canvas based on parent container element
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDown = (e) => {
    if (hoveredNode) {
      draggedNodeRef.current = hoveredNode;
      setIsDraggingNode(true);
      setCanvasDraggable(true); // Dynamically enable native browser dragging when clicking a node
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (draggedNodeRef.current) {
      const width = canvas.width;
      const height = canvas.height;
      if (is3D) {
        const focalLength = 300;
        const scale = focalLength / (focalLength + draggedNodeRef.current.z);
        draggedNodeRef.current.x = (mouseX - width / 2) / scale;
        draggedNodeRef.current.y = (mouseY - height / 2) / scale;
      } else {
        draggedNodeRef.current.x = mouseX - width / 2;
        draggedNodeRef.current.y = mouseY - height / 2;
      }
      return;
    }

    // Hover detection
    let found = null;
    nodesRef.current.forEach(node => {
      const dx = node.projX - mouseX;
      const dy = node.projY - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Substantially increased hit zone (3.2x node radius) to make holding/clicking nodes extremely easy
      if (dist < node.projRadius * 3.2) {
        found = node;
      }
    });

    hoveredNodeRef.current = found;
    setHoveredNode(found);
  };

  const handleMouseUp = () => {
    draggedNodeRef.current = null;
    setIsDraggingNode(false);
    setCanvasDraggable(false); // Reset native dragging state
  };

  const handleMouseClick = () => {
    if (hoveredNode && !isDraggingNode) {
      setSelectedNode(hoveredNode);
      if (onSelectNode) {
        onSelectNode(hoveredNode);
      }
    }
  };

  const handleDragStart = (e) => {
    const node = hoveredNodeRef.current || draggedNodeRef.current || selectedNode;
    if (node) {
      const dragData = {
        page: node.page,
        header: node.label.split(': ').pop(),
        text: node.text
      };
      e.dataTransfer.setData("application/json", JSON.stringify(dragData));
      e.dataTransfer.effectAllowed = "copy";

      // Create a small, beautiful drag preview icon (36x36 circle with document emoji)
      try {
        const dragCanvas = document.createElement('canvas');
        dragCanvas.width = 36;
        dragCanvas.height = 36;
        const dctx = dragCanvas.getContext('2d');

        // Draw soft blue circle
        dctx.fillStyle = '#4C8DFF';
        dctx.beginPath();
        dctx.arc(18, 18, 16, 0, 2 * Math.PI);
        dctx.fill();

        // Render document emoji in center
        dctx.font = '16px serif';
        dctx.textAlign = 'center';
        dctx.textBaseline = 'middle';
        dctx.fillText('📄', 18, 18);

        e.dataTransfer.setDragImage(dragCanvas, 18, 18);
      } catch (err) {
        console.error("Failed to generate custom drag image:", err);
      }

      // Stop internal physics simulation from dragging this node
      draggedNodeRef.current = null;
      setIsDraggingNode(false);
    }
  };

  const handleDragEnd = () => {
    setCanvasDraggable(false);
    draggedNodeRef.current = null;
    setIsDraggingNode(false);
  };

  const isStudy = workspaceType === "study";
  const bgTheme = isStudy ? "bg-white border-[#E2E8F0]" : "bg-[#161616] border-[#2A2A2A]";
  const textTheme = isStudy ? "text-zinc-800" : "text-white";
  const subTextTheme = isStudy ? "text-slate-400" : "text-[#9A9A9A]";
  const btnTheme = isStudy ? "bg-[#F8FAFC] border-[#E2E8F0] hover:bg-slate-100 text-slate-700" : "bg-[#2A2A2A] border-[#2A2A2A] hover:bg-[#4C8DFF] text-white";

  return (
    <div
      ref={containerRef}
      className={`w-[300px] h-full flex flex-col relative border-l select-none ${bgTheme}`}
    >
      <div className={`p-4 border-b select-none flex items-center justify-between ${isStudy ? 'border-[#E2E8F0]' : 'border-[#2A2A2A]'}`}>
        <div>
          <h3 className={`font-display text-xs font-semibold tracking-wide ${textTheme}`}>
            {isStudy ? "Mastery Concept Map" : (is3D ? "3D Concept Graph" : "2D Concept Graph")}
          </h3>
          <p className={`text-[9px] mt-0.5 leading-relaxed ${subTextTheme}`}>
            {isStudy ? "Click nodes to scope study questions." : "Click nodes to scope chat."}
          </p>
        </div>
        <button
          onClick={() => setIs3D(prev => !prev)}
          className={`text-[8px] px-2 py-1 rounded font-mono font-bold transition border cursor-pointer ${btnTheme}`}
        >
          {is3D ? "2D Map" : "3D Map"}
        </button>
      </div>

      {isStudy && (
        <div className="px-4 py-2.5 flex gap-1.5 border-b border-[#E2E8F0] bg-[#F8FAFC] text-[8px] select-none shrink-0 font-sans font-bold overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {['all', 'again', 'good', 'easy'].map(mode => {
            const modeLabels = {
              all: 'All',
              again: '🔴 Again',
              good: '🟡 Good',
              easy: '🟢 Easy'
            };
            const isActive = filterMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-2.5 py-1 rounded transition uppercase tracking-wider text-[8px] cursor-pointer font-bold border shrink-0 ${isActive
                    ? 'bg-[#4C8DFF] border-[#4C8DFF] text-white shadow-sm font-bold'
                    : 'bg-white border-[#E2E8F0] text-zinc-650 hover:bg-zinc-50 font-semibold'
                  }`}
              >
                {modeLabels[mode]}
              </button>
            );
          })}
        </div>
      )}

      {/* Canvas container */}
      <div className={`flex-1 min-h-0 relative m-3.5 border rounded-2xl overflow-hidden shadow-sm ${isStudy ? 'border-[#E2E8F0] bg-[#F8FAFC]' : 'border-[#2A2A2A] bg-[#0D0D0D]'
        }`}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleMouseClick}
          draggable={canvasDraggable}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className={`w-full h-full ${hoveredNode ? (isDraggingNode ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
        />

        {/* Selected Node Metadata popover */}
        {selectedNode && (
          <div className={`absolute bottom-4 left-4 right-4 border p-4 rounded-xl shadow-2xl animate-fade-in text-[10px] flex flex-col gap-2 z-10 ${isStudy ? 'bg-white border-[#E2E8F0]' : 'bg-[#0A0A0A] border-[#2A2A2A]'
            }`}>
            <div className={`flex justify-between items-center border-b pb-1.5 ${isStudy ? 'border-[#E2E8F0]' : 'border-[#2A2A2A]'}`}>
              <span className={`font-semibold truncate max-w-[65%] ${isStudy ? 'text-zinc-800' : 'text-white'}`}>{selectedNode.label.split(': ').pop()}</span>
              <span className="bg-[#4C8DFF]/15 border border-[#4C8DFF]/20 text-[#4C8DFF] px-1.5 py-0.2 rounded font-mono text-[9px]">p.{selectedNode.page}</span>
            </div>
            <p className={`${isStudy ? 'text-zinc-600' : 'text-zinc-400'} leading-relaxed italic`}>"{selectedNode.text}"</p>

            {/* Draggable Topic Pill */}
            <div
              draggable={true}
              onDragStart={(e) => {
                const dragData = {
                  page: selectedNode.page,
                  header: selectedNode.label.split(': ').pop(),
                  text: selectedNode.text
                };
                e.dataTransfer.setData("application/json", JSON.stringify(dragData));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="mt-1 bg-[#4C8DFF] hover:bg-[#3B7BE6] text-white py-1.5 px-3 rounded-lg text-center font-sans font-bold cursor-grab active:cursor-grabbing transition shadow-sm select-none"
            >
              🫳 Drag to Chat Input
            </div>

            {isStudy && onGradeNode && (
              <div className="flex gap-1.5 pt-2 border-t border-[#E2E8F0] mt-1">
                <button
                  type="button"
                  onClick={() => onGradeNode(selectedNode.label.split(': ').pop(), "Again")}
                  className="flex-1 py-1 text-[9px] font-bold rounded-md bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition cursor-pointer"
                >
                  🔴 Again
                </button>
                <button
                  type="button"
                  onClick={() => onGradeNode(selectedNode.label.split(': ').pop(), "Good")}
                  className="flex-1 py-1 text-[9px] font-bold rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 transition cursor-pointer"
                >
                  🟡 Good
                </button>
                <button
                  type="button"
                  onClick={() => onGradeNode(selectedNode.label.split(': ').pop(), "Easy")}
                  className="flex-1 py-1 text-[9px] font-bold rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer"
                >
                  🟢 Easy
                </button>
              </div>
            )}

            <button
              onClick={() => setSelectedNode(null)}
              className={`text-[9px] font-semibold mt-1 text-right transition cursor-pointer ${isStudy ? 'text-slate-500 hover:text-slate-900' : 'text-[#9A9A9A] hover:text-white'}`}
            >
              ✕ Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConceptGraph3D;
