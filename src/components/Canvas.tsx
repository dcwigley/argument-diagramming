import React, { useState, useRef, useEffect } from 'react';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import Xarrow, { Xwrapper, useXarrow } from 'react-xarrows';
import { Node } from './Node';
import { Toolbar } from './Toolbar';
import { v4 as uuidv4 } from 'uuid';

export type NodeType = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    content: string;
};

export type ArrowType = {
    id: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
};

export type ConnectionType = {
    start: string;
    end: string;
};

const UpdateArrows: React.FC<{ updateRef: React.MutableRefObject<(() => void) | null> }> = ({ updateRef }) => {
    const updateXarrow = useXarrow();
    useEffect(() => {
        updateRef.current = updateXarrow;
    }, [updateXarrow, updateRef]);
    return null;
};

export const Canvas: React.FC = () => {
    const updateArrowsRef = useRef<(() => void) | null>(null);
    const [nodes, setNodes] = useState<NodeType[]>([]);
    const [arrows, setArrows] = useState<ArrowType[]>([]);

    // Legacy connection state (can clean up later if unused)
    const [connections] = useState<ConnectionType[]>([]);

    const [mode, setMode] = useState<'PAN' | 'SELECT' | 'CONNECT'>('PAN');
    // ... [rest of state same as before]
    const [connectionStart, setConnectionStart] = useState<string | null>(null);
    const [panningDisabled, setPanningDisabled] = useState(false);

    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
    const selectionStartRef = useRef<{ x: number, y: number } | null>(null);

    // Context Menu state
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'ARROW' | 'NODE', id: string } | null>(null);

    // Border visibility state
    const [showBorders, setShowBorders] = useState(true);

    // Lock Movement state
    const [isLocked, setIsLocked] = useState(false);

    const transformComponentRef = useRef<ReactZoomPanPinchRef>(null);

    // Helper to get view center
    const getViewCenter = () => {
        if (transformComponentRef.current) {
            const { positionX, positionY, scale } = transformComponentRef.current.instance.transformState;
            const centerX = (window.innerWidth / 2 - positionX) / scale;
            const centerY = ((window.innerHeight / 3) - positionY) / scale;
            return { x: centerX, y: centerY };
        }
        return { x: 2500, y: 2500 };
    };

    const getPointFromEvent = (e: React.PointerEvent | PointerEvent) => {
        if (transformComponentRef.current) {
            const { positionX, positionY, scale } = transformComponentRef.current.instance.transformState;
            return {
                x: (e.clientX - positionX) / scale,
                y: (e.clientY - positionY) / scale
            };
        }
        return { x: 0, y: 0 };
    };

    const addNode = () => {
        const { x, y } = getViewCenter();
        const id = uuidv4();
        setNodes((prev) => [...prev, { id, x: x - 100, y, width: 200, height: 100, content: '' }]);
    };

    const addArrow = () => {
        const { x, y } = getViewCenter();
        const id = uuidv4();
        // Downward pointing arrow
        setArrows(prev => [...prev, {
            id,
            start: { x: x, y: y },
            end: { x: x, y: y + 200 }
        }]);
    };

    const deleteArrow = (id: string) => {
        setArrows(prev => prev.filter(a => a.id !== id));
        setContextMenu(null);
    };

    const deleteNode = (id: string) => {
        setNodes(prev => prev.filter(n => n.id !== id));
        setContextMenu(null);
    };

    const handleNodeDragStart = () => {
        setPanningDisabled(true);
    };

    const handleNodeDragStop = (id: string, x: number, y: number) => {
        setPanningDisabled(false);
        setNodes((prev) => prev.map(n => n.id === id ? { ...n, x, y } : n));

        // Always clear selection immediately after dropping
        setSelectedNodeIds(new Set());
    };

    const handleNodeDrag = (id: string, dx: number, dy: number) => {
        const isGroupDrag = selectedNodeIds.has(id);

        setNodes(prev => prev.map(n => {
            if (isGroupDrag && selectedNodeIds.has(n.id)) {
                return { ...n, x: n.x + dx, y: n.y + dy };
            } else if (n.id === id) {
                return { ...n, x: n.x + dx, y: n.y + dy };
            }
            return n;
        }));

        if (isGroupDrag) {
            setArrows(prev => prev.map(a =>
                selectedNodeIds.has(a.id)
                    ? { ...a, start: { x: a.start.x + dx, y: a.start.y + dy }, end: { x: a.end.x + dx, y: a.end.y + dy } }
                    : a
            ));
        }
    };

    const handleNodeContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'NODE', id });
    };

    // --- Arrow Drag Logic ---
    const [draggedArrowHandle, setDraggedArrowHandle] = useState<{ id: string, type: 'start' | 'end' | 'body' } | null>(null);

    const handleArrowHandleDown = (e: React.PointerEvent, id: string, type: 'start' | 'end') => {
        e.stopPropagation();
        e.preventDefault();
        setContextMenu(null);
        setPanningDisabled(true);
        setDraggedArrowHandle({ id, type });
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handleArrowBodyDown = (e: React.PointerEvent, id: string) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();
        setContextMenu(null); // Close context menu when starting drag
        setPanningDisabled(true);
        setDraggedArrowHandle({ id, type: 'body' });
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handleWrapperPointerDown = (e: React.PointerEvent) => {
        // Close context menu on any pointer down
        setContextMenu(null);

        if (e.shiftKey) {
            e.stopPropagation();
            e.preventDefault();
            const start = getPointFromEvent(e);
            selectionStartRef.current = start;
            setSelectionBox({ x: start.x, y: start.y, w: 0, h: 0 });
            setPanningDisabled(true);
            e.currentTarget.setPointerCapture(e.pointerId);
        }
    };

    const handleWrapperPointerMove = (e: React.PointerEvent) => {
        // Arrow Drag Logic
        if (draggedArrowHandle) {
            e.stopPropagation();
            const scale = transformComponentRef.current?.instance.transformState.scale || 1;
            const dx = e.movementX / scale;
            const dy = e.movementY / scale;

            if (draggedArrowHandle.type === 'body' && selectedNodeIds.has(draggedArrowHandle.id)) {
                // Group Drag via Arrow
                setNodes(prev => prev.map(n =>
                    selectedNodeIds.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n
                ));
                setArrows(prev => prev.map(a =>
                    selectedNodeIds.has(a.id)
                        ? { ...a, start: { x: a.start.x + dx, y: a.start.y + dy }, end: { x: a.end.x + dx, y: a.end.y + dy } }
                        : a
                ));
            } else {
                setArrows(prev => prev.map(arrow => {
                    if (arrow.id !== draggedArrowHandle.id) return arrow;

                    if (draggedArrowHandle.type === 'start') {
                        return { ...arrow, start: { x: arrow.start.x + dx, y: arrow.start.y + dy } };
                    } else if (draggedArrowHandle.type === 'end') {
                        return { ...arrow, end: { x: arrow.end.x + dx, y: arrow.end.y + dy } };
                    } else {
                        // Body drag
                        return {
                            ...arrow,
                            start: { x: arrow.start.x + dx, y: arrow.start.y + dy },
                            end: { x: arrow.end.x + dx, y: arrow.end.y + dy }
                        };
                    }
                }));
            }
            return;
        }

        // Selection Box Logic
        if (selectionStartRef.current) {
            e.stopPropagation();
            const current = getPointFromEvent(e);
            const start = selectionStartRef.current;

            const x = Math.min(start.x, current.x);
            const y = Math.min(start.y, current.y);
            const w = Math.abs(current.x - start.x);
            const h = Math.abs(current.y - start.y);

            setSelectionBox({ x, y, w, h });

            // Check intersections (Nodes)
            const newSelected = new Set<string>();
            nodes.forEach(node => {
                const nodeRight = node.x + node.width;
                const nodeBottom = node.y + node.height;
                const boxRight = x + w;
                const boxBottom = y + h;

                // AABB Intersection
                if (node.x < boxRight && nodeRight > x && node.y < boxBottom && nodeBottom > y) {
                    newSelected.add(node.id);
                }
            });

            // Check intersections (Arrows)
            arrows.forEach(arrow => {
                if ((arrow.start.x > x && arrow.start.x < x + w && arrow.start.y > y && arrow.start.y < y + h) ||
                    (arrow.end.x > x && arrow.end.x < x + w && arrow.end.y > y && arrow.end.y < y + h)) {
                    newSelected.add(arrow.id);
                }
            });

            setSelectedNodeIds(newSelected);
        }
    };

    const handleWrapperPointerUp = (e: React.PointerEvent) => {
        if (draggedArrowHandle) {
            setDraggedArrowHandle(null);
            setPanningDisabled(false);
            e.currentTarget.releasePointerCapture(e.pointerId);

            // Always clear selection immediately after dropping an arrow
            // This covers the case where a group was dragged via an arrow
            setSelectedNodeIds(new Set());
        }
        if (selectionStartRef.current) {
            selectionStartRef.current = null;
            setSelectionBox(null);
            setPanningDisabled(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    };

    // ... (rest of handlers)

    const handleNodeClick = (_id: string) => { /* ... keep existing logic if needed ... */ };
    const handleBgClick = () => { setConnectionStart(null); };
    const handleNodeContentChange = (id: string, content: string) => {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, content } : n));
    };

    // --- RENDER HELPERS ---
    // We need real DOM elements for Xarrow to attach to.
    // We will render draggable handle Divs.

    // --- SAVE / LOAD ---
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSave = async () => {
        const data = {
            nodes,
            arrows,
            version: 1
        };
        const jsonString = JSON.stringify(data, null, 2);

        try {
            // @ts-ignore - File System Access API
            if (window.showSaveFilePicker) {
                // @ts-ignore
                const handle = await window.showSaveFilePicker({
                    types: [{
                        description: 'Argument Diagram',
                        accept: { 'application/json': ['.json'] },
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(jsonString);
                await writable.close();
            } else {
                // Fallback
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'diagram.json';
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error("Save failed:", err);
                alert("Failed to save diagram");
            }
        }
    };

    const handleLoad = async () => {
        try {
            // @ts-ignore - File System Access API
            if (window.showOpenFilePicker) {
                // @ts-ignore
                const [handle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'Argument Diagram',
                        accept: { 'application/json': ['.json'] },
                    }],
                    multiple: false
                });
                const file = await handle.getFile();
                const content = await file.text();
                const data = JSON.parse(content);
                if (data.nodes && data.arrows) {
                    setNodes(data.nodes);
                    setArrows(data.arrows);
                }
            } else {
                fileInputRef.current?.click();
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error("Load failed:", err);
                alert("Failed to load diagram");
            }
        }
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = event.target?.result as string;
                const data = JSON.parse(json);
                if (data.nodes && data.arrows) {
                    setNodes(data.nodes);
                    setArrows(data.arrows);
                }
            } catch (err) {
                console.error("Failed to parse diagram file", err);
                alert("Invalid diagram file");
            }
        };
        reader.readAsText(file);
        // Reset input value to allow re-loading same file
        e.target.value = '';
    };

    return (
        <div
            className="w-screen h-screen relative bg-background overflow-hidden select-none"
            onPointerDown={handleWrapperPointerDown}
            onPointerMove={handleWrapperPointerMove}
            onPointerUp={handleWrapperPointerUp}
        >
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".json"
                onChange={onFileChange}
            />
            <Toolbar
                onAddNode={addNode}
                onAddArrow={addArrow}
                onSave={handleSave}
                onLoad={handleLoad}
                showBorders={showBorders}
                onToggleBorders={() => setShowBorders(!showBorders)}
                isLocked={isLocked}
                onToggleLock={() => setIsLocked(!isLocked)}
            />



            {/* WORKSPACE (Nodes & Handles) */}
            <div className="absolute inset-0 z-10">
                <TransformWrapper
                    ref={transformComponentRef}
                    disabled={panningDisabled || mode !== 'PAN' || isLocked}
                    limitToBounds={false}
                    minScale={0.1}
                    maxScale={4}
                    initialScale={1}
                    initialPositionX={-2000}
                    initialPositionY={-100}
                    doubleClick={{ disabled: true }}
                    onTransformed={() => updateArrowsRef.current?.()}
                    onPanning={() => updateArrowsRef.current?.()}
                >
                    <TransformComponent wrapperClass="w-full h-full" contentClass="w-full h-full">
                        <div
                            className="w-[5000px] h-[5000px] bg-grid-pattern relative border border-white/5"
                            onClick={handleBgClick}
                            onPointerDown={(e) => {
                                if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
                                    if (contextMenu) setContextMenu(null);
                                    e.stopPropagation();
                                }
                            }}
                            onMouseDown={(e) => {
                                if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
                                    e.stopPropagation();
                                }
                            }}
                        >


                            {/* SELECTION BOX */}
                            {selectionBox && (
                                <div
                                    className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none z-[60]"
                                    style={{
                                        left: selectionBox.x,
                                        top: selectionBox.y,
                                        width: selectionBox.w,
                                        height: selectionBox.h
                                    }}
                                />
                            )}

                            {/* NODES */}
                            {nodes.map(node => (
                                <Node
                                    key={node.id}
                                    id={node.id}
                                    initialX={node.x}
                                    initialY={node.y}
                                    content={node.content}
                                    onDragStart={handleNodeDragStart}
                                    onDrag={(dx, dy) => handleNodeDrag(node.id, dx, dy)}
                                    onDragStop={(x, y) => handleNodeDragStop(node.id, x, y)}
                                    mode={mode}
                                    onClick={() => handleNodeClick(node.id)}
                                    onChange={(c) => handleNodeContentChange(node.id, c)}
                                    isSelected={connectionStart === node.id || selectedNodeIds.has(node.id)}
                                    onContextMenu={(e) => handleNodeContextMenu(e, node.id)}
                                    showBorders={showBorders}
                                    isLocked={isLocked}
                                />
                            ))}

                            {/* ARROW HANDLES (Inside Grid, Scaled) */}
                            {arrows.map(arrow => (
                                <React.Fragment key={`arrow-handles-${arrow.id}`}>
                                    {/* Start Handle */}
                                    <div
                                        id={`arrow-${arrow.id}-start`}
                                        className="absolute w-12 h-12 z-[70] flex items-center justify-center cursor-move select-none"
                                        style={{ left: Math.round(arrow.start.x) - 24, top: Math.round(arrow.start.y) - 24 }}
                                        onPointerDown={(e) => handleArrowHandleDown(e, arrow.id, 'start')}
                                    >
                                        <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-sm pointer-events-none" />
                                    </div>

                                    {/* End Handle */}
                                    <div
                                        id={`arrow-${arrow.id}-end`}
                                        className="absolute w-12 h-12 z-[70] flex items-center justify-center cursor-move select-none"
                                        style={{ left: Math.round(arrow.end.x) - 24, top: Math.round(arrow.end.y) - 24 }}
                                        onPointerDown={(e) => handleArrowHandleDown(e, arrow.id, 'end')}
                                    >
                                        <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-sm pointer-events-none" />
                                    </div>
                                </React.Fragment>
                            ))}
                        </div>
                    </TransformComponent>
                </TransformWrapper>
            </div>

            {/* ARROWS OVERLAY (On Top, Pointer Events None Container) */}
            <div className="absolute inset-0 pointer-events-none z-20">
                <Xwrapper>
                    <UpdateArrows updateRef={updateArrowsRef} />
                    {/* ARROW BODIES */}
                    {arrows.map(arrow => (
                        <Xarrow
                            key={`arrow-body-${arrow.id}`}
                            start={`arrow-${arrow.id}-start`}
                            end={`arrow-${arrow.id}-end`}
                            color="#60a5fa"
                            strokeWidth={4}
                            path="straight"
                            showHead={true}
                            headSize={6}
                            curveness={0}
                            startAnchor="middle"
                            endAnchor="middle"
                            zIndex={30}
                            passProps={{
                                cursor: 'move',
                                onPointerDown: (e: React.PointerEvent) => {
                                    handleArrowBodyDown(e, arrow.id);
                                },
                                onContextMenu: (e: React.MouseEvent) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setContextMenu({ x: e.clientX, y: e.clientY, type: 'ARROW', id: arrow.id });
                                },
                                pointerEvents: 'auto'
                            }}
                        />
                    ))}
                    {/* LEGACY CONNECTIONS */}
                    {connections.map((conn, i) => (
                        <Xarrow
                            key={i}
                            start={conn.start}
                            end={conn.end}
                            color="#64748b"
                            strokeWidth={2}
                            path="smooth"
                            showHead={true}
                            headSize={4}
                            curveness={0.3}
                            startAnchor="auto"
                            endAnchor="auto"
                            zIndex={0}
                        />
                    ))}
                </Xwrapper>
            </div>

            {/* CONTEXT MENU */}
            {contextMenu && (
                <div
                    className="fixed bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 z-[100]"
                    style={{
                        left: contextMenu.x,
                        top: contextMenu.y
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    {contextMenu.type === 'ARROW' ? (
                        <button
                            className="w-full px-4 py-2 text-left text-sm text-white hover:bg-slate-700 transition-colors flex items-center gap-2"
                            onClick={() => deleteArrow(contextMenu.id)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                deleteArrow(contextMenu.id);
                            }}
                        >
                            <span>🗑️</span>
                            <span>Delete Arrow</span>
                        </button>
                    ) : (
                        <button
                            className="w-full px-4 py-2 text-left text-sm text-white hover:bg-slate-700 transition-colors flex items-center gap-2"
                            onClick={() => deleteNode(contextMenu.id)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                deleteNode(contextMenu.id);
                            }}
                        >
                            <span>🗑️</span>
                            <span>Delete Node</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
