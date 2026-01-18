import React, { useState, useRef, useEffect } from 'react';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import Xarrow, { Xwrapper, useXarrow } from 'react-xarrows';
import { Node } from './Node';
import { Toolbar } from './Toolbar';
import { v4 as uuidv4 } from 'uuid';
import { io, Socket } from 'socket.io-client';
import Peer from 'simple-peer';

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
    const transformComponentRef = useRef<ReactZoomPanPinchRef>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const selectionStartRef = useRef<{ x: number, y: number } | null>(null);
    const isRemoteUpdate = useRef(false);

    const [nodes, setNodes] = useState<NodeType[]>(() => {
        // const data = getSavedData();
        // return data?.nodes || [];
        return [];
    });

    const [arrows, setArrows] = useState<ArrowType[]>(() => {
        // const data = getSavedData();
        // return data?.arrows || [];
        return [];
    });

    const [socket, setSocket] = useState<Socket | null>(null);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Legacy connection state (can clean up later if unused)
    const [connections] = useState<ConnectionType[]>([]);

    // UI State
    const [mode] = useState<'PAN' | 'SELECT' | 'CONNECT'>('PAN');
    const [connectionStart, setConnectionStart] = useState<string | null>(null);
    const [panningDisabled, setPanningDisabled] = useState(false);
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'ARROW' | 'NODE', id: string } | null>(null);
    const [showBorders, setShowBorders] = useState(true);
    const [isLocked, setIsLocked] = useState(false);

    // Emitter for live drag (Throttling removed for group sync correctness)
    const emitUpdate = (event: string, data: any) => {
        socket?.emit(event, data);
    };

    // Voice Chat State
    const [isMicEnabled, setIsMicEnabled] = useState(false);
    const peersRef = useRef<{ peerID: string, peer: Peer.Instance }[]>([]);
    const userStream = useRef<MediaStream | null>(null);

    const toggleMic = () => {
        if (isMicEnabled) {
            // Mute / Stop
            // Ideally we just mute tracks, or stop completely?
            // Let's stop completely for privacy "off".
            if (userStream.current) {
                userStream.current.getTracks().forEach(track => track.stop());
                userStream.current = null;
            }
            // Destroy all peers
            peersRef.current.forEach(p => p.peer.destroy());
            peersRef.current = [];
            setIsMicEnabled(false);
        } else {
            // Start
            navigator.mediaDevices.getUserMedia({ video: false, audio: true }).then(stream => {
                userStream.current = stream;
                setIsMicEnabled(true);

                // We ask the server who is here?
                // Actually, we can just ask again or rely on the join logic if we auto-joined.
                // But since this is a toggle, we need to signal "I am ready to talk" to everyone.
                // Re-using the "join_room" logic slightly or adding a specific "join_audio" event.
                // Let's assume on toggle ON, we seek all users.
                // Just emit a "join_room" again? No, that resets canvas.
                // Let's rely on the "all users" event which we might have missed if we just toggled content.
                // Actually, the server should send us the list when we want to join audio?
                // Or we store the list of users in the room in a ref?
                // Let's upgrade the socket logic to track "usersInRoom" locally.

                // Simpler: Just emit 'join_audio_room' if we had it, or re-request user list.
                // For this MVP, let's just trigger the connection process to users we know about. 
                // We will add a socket.on('all users') handler below.
                if (socket && roomId) {
                    // Re-fetch users to start calls
                    socket.emit('join_room', roomId);
                }
            }).catch(err => {
                console.error("Failed to get microphone:", err);
                alert("Could not access microphone.");
            });
        }
    };


    const createPeer = (userToSignal: string, callerID: string, stream: MediaStream) => {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            socket?.emit('sending signal', { userToSignal, callerID, signal });
        });

        peer.on('stream', stream => {
            const audio = document.createElement('audio');
            audio.srcObject = stream;
            audio.play();
        });

        return peer;
    };

    const addPeer = (incomingSignal: any, callerID: string, stream: MediaStream) => {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            socket?.emit('returning signal', { signal, callerID });
        });

        peer.on('stream', stream => {
            const audio = document.createElement('audio');
            audio.srcObject = stream;
            audio.play();
        });

        peer.signal(incomingSignal);

        return peer;
    };

    // ... existing ...

    const handleClearRequest = () => {
        setShowClearConfirm(true);
    };

    // ... handleClearConfirm ...

    // ... handleClearCancel ...

    // ... useEffect socket ...
    useEffect(() => {
        if (!socket) return;

        socket.on('all users', (users: string[]) => {
            console.log('Users in room:', users);
            if (isMicEnabled && userStream.current && socket.id) {
                // Initiate calls to all existing users
                users.forEach(userID => {
                    // Check if already connected?
                    const peer = createPeer(userID, socket.id!, userStream.current!);
                    peersRef.current.push({
                        peerID: userID,
                        peer,
                    });
                });
            }
        });

        socket.on('user joined audio', payload => {
            // payload: { signal, callerID }
            console.log("User joined audio, receiving signal from:", payload.callerID);
            if (userStream.current) {
                const peer = addPeer(payload.signal, payload.callerID, userStream.current);
                peersRef.current.push({
                    peerID: payload.callerID,
                    peer,
                });
            }
        });

        socket.on('receiving returned signal', payload => {
            const item = peersRef.current.find(p => p.peerID === payload.id);
            if (item) {
                item.peer.signal(payload.signal);
            }
        });

        return () => {
            if (socket) {
                socket.off('all users');
                socket.off('user joined audio');
                socket.off('receiving returned signal');
            }
        };

    }, [socket, isMicEnabled]); // Dependency on socket and mic state

    // ... handleClearConfirm (moved back to proper scope) ...
    const handleClearConfirm = () => {
        if (socket && roomId) {
            socket.emit('room:clear');
            setNodes([]);
            setArrows([]);
        }
        setShowClearConfirm(false);
    };



    const handleClearCancel = () => {
        setShowClearConfirm(false);
    };



    // Helper to get/set local storage for the CURRENT room
    const getSavedData = () => {
        if (!roomId) return null;
        try {
            const raw = localStorage.getItem(`room_${roomId}`);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error("Failed to load local data", e);
            return null;
        }
    };

    const saveData = (n: NodeType[], a: ArrowType[]) => {
        if (!roomId) return;
        try {
            localStorage.setItem(`room_${roomId}`, JSON.stringify({ nodes: n, arrows: a }));
        } catch (e) {
            console.error("Failed to save local data", e);
        }
    };

    // Auto-save useEffect
    useEffect(() => {
        if (!roomId || nodes.length === 0 && arrows.length === 0) return;
        // Don't save empty state over existing state if we just loaded?
        // Actually, if user deletes everything, we SHOULD save empty.
        // But to avoid clobbering on initial load race conditions, verify initialization.
        saveData(nodes, arrows);
    }, [nodes, arrows, roomId]);

    // Unified Room Connection Logic
    useEffect(() => {
        if (!socket || !roomId) return;

        // 1. Setup Listener for Initial State
        const handleInitState = (serverData: { nodes: NodeType[], arrows: ArrowType[] }) => {
            if (serverData.nodes.length > 0 || serverData.arrows.length > 0) {
                console.log('Received server state, updating local.');
                isRemoteUpdate.current = true;
                setNodes(serverData.nodes);
                setArrows(serverData.arrows);
            } else {
                // Server is empty. Check local storage for backup (Hydration).
                const localData = getSavedData();
                if (localData && (localData.nodes.length > 0 || localData.arrows.length > 0)) {
                    console.log('Server empty, hydrating from local storage backup.');
                    socket.emit('hydrate_state', localData);
                    // Optimistically update local too
                    isRemoteUpdate.current = true;
                    setNodes(localData.nodes);
                    setArrows(localData.arrows);
                }
            }
        };

        socket.on('init_state', handleInitState);

        // 2. Define Reconnection/Join Handler
        const handleJoin = () => {
            console.log('Joining room:', roomId);
            socket.emit('join_room', roomId);
        };

        // 3. Join immediately if connected
        if (socket.connected) {
            handleJoin();
        }

        // 4. Handle future reconnections
        socket.on('connect', handleJoin);

        // 5. Handle Full State Updates (e.g. from Hydration)
        const handleUpdateState = (newState: { nodes: NodeType[], arrows: ArrowType[] }) => {
            console.log('Received full state update.');
            isRemoteUpdate.current = true;
            setNodes(newState.nodes);
            setArrows(newState.arrows);
        };

        socket.on('update_state', handleUpdateState);

        return () => {
            socket.off('init_state', handleInitState);
            socket.off('connect', handleJoin);
            socket.off('update_state', handleUpdateState);
        };
    }, [socket, roomId]);


    useEffect(() => {
        // Connect to server (Ensure port matches server/index.js for local dev)
        // In production (Render), undefined url lets it auto-discover the host serving the page
        const socketUrl = import.meta.env.DEV ? 'http://localhost:3001' : undefined;
        const newSocket = io(socketUrl, {
            transports: ['websocket'], // Force websocket to avoid sticky session issues on Render
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
        });
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Connected to server');
        });



        // --- Granular Listeners ---
        newSocket.on('node:add', (node) => {
            isRemoteUpdate.current = true;
            setNodes(prev => [...prev, node]);
        });

        newSocket.on('node:update', (updatedNode) => {
            isRemoteUpdate.current = true;
            setNodes(prev => prev.map(n => n.id === updatedNode.id ? updatedNode : n));
        });

        newSocket.on('node:delete', (nodeId) => {
            isRemoteUpdate.current = true;
            setNodes(prev => prev.filter(n => n.id !== nodeId));
        });

        newSocket.on('arrow:add', (arrow) => {
            isRemoteUpdate.current = true;
            setArrows(prev => [...prev, arrow]);
        });

        newSocket.on('arrow:update', (updatedArrow) => {
            isRemoteUpdate.current = true;
            setArrows(prev => prev.map(a => a.id === updatedArrow.id ? updatedArrow : a));
        });

        newSocket.on('arrow:delete', (arrowId) => {
            isRemoteUpdate.current = true;
            setArrows(prev => prev.filter(a => a.id !== arrowId));
        });

        // Settings Sync
        newSocket.on('toggle:borders', (val) => {
            isRemoteUpdate.current = true;
            setShowBorders(val);
        });

        newSocket.on('toggle:lock', (val) => {
            isRemoteUpdate.current = true;
            setIsLocked(val);
        });

        // Viewport Sync
        newSocket.on('viewport:update', (v) => {
            if (!transformComponentRef.current) return;
            isRemoteUpdate.current = true;
            transformComponentRef.current.setTransform(v.x, v.y, v.scale, 0);
        });

        return () => {
            newSocket.disconnect();
        };
    }, []);

    // Reset remote flag after render
    useEffect(() => {
        if (isRemoteUpdate.current) {
            isRemoteUpdate.current = false;
        }
    });

    // ... (rest of local storage persistence code - keep it as backup/offline cache)





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
        const newNode = { id, x: x - 100, y, width: 200, height: 100, content: '' };
        setNodes((prev) => [...prev, newNode]);
        socket?.emit('node:add', newNode);
    };

    const addArrow = () => {
        const { x, y } = getViewCenter();
        const id = uuidv4();
        // Downward pointing arrow
        const newArrow = {
            id,
            start: { x: x, y: y },
            end: { x: x, y: y + 200 }
        };
        setArrows(prev => [...prev, newArrow]);
        socket?.emit('arrow:add', newArrow);
    };

    const deleteArrow = (id: string) => {
        setArrows(prev => prev.filter(a => a.id !== id));
        setContextMenu(null);
        socket?.emit('arrow:delete', id);
    };

    const deleteNode = (id: string) => {
        setNodes(prev => prev.filter(n => n.id !== id));
        setContextMenu(null);
        socket?.emit('node:delete', id);
    };

    const handleNodeDragStart = () => {
        setPanningDisabled(true);
    };

    const handleNodeDragStop = (id: string, x: number, y: number) => {
        setPanningDisabled(false);

        // Prepare updates
        const updates: NodeType[] = [];

        setNodes((prev) => prev.map(n => {
            if (n.id === id) {
                const updated = { ...n, x, y };
                updates.push(updated);
                return updated;
            }
            return n;
        }));

        // Allow group drag updates here if needed (currently handleNodeDragStop is only for single node drop effectively? 
        // Logic below handles group updates because handleNodeDrag updates state during drag, but we only emit on stop? 
        // Actually handleNodeDragStop is only called by the specific node being dragged.
        // If we want to support group drag stop, we might need to iterate selected nodes.
        // For now, let's just emit for the single node to prove concept, or iterate if we can access the latest state.

        // Better approach: In handleNodeDrag, we update LOCAL state. 
        // onDragStop, we should emit the FINAL state of all affected nodes.
        // However, onDragStop only gives us the x,y of the single node.

        // Simpler for now: Emit the specific node update.
        // updates.forEach(n => socket?.emit('node:update', n));

        // FIX: Update ALL selected nodes
        setNodes(prev => {
            const next = prev.map(n => {
                if (n.id === id) {
                    return { ...n, x, y };
                }
                return n;
            });

            next.forEach(n => {
                if (n.id === id || selectedNodeIds.has(n.id)) {
                    socket?.emit('node:update', n);
                }
            });
            return next;
        });

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

        // Live Sync (Throttled)
        if (isGroupDrag) {
            nodes.forEach(n => {
                if (n.id === id || selectedNodeIds.has(n.id)) {
                    const updated = { ...n, x: n.x + dx, y: n.y + dy };
                    emitUpdate('node:update', updated);
                }
            });
            // Also sync arrows moving with group
            arrows.forEach(a => {
                if (selectedNodeIds.has(a.id)) {
                    const updatedArrow = { ...a, start: { x: a.start.x + dx, y: a.start.y + dy }, end: { x: a.end.x + dx, y: a.end.y + dy } };
                    emitUpdate('arrow:update', updatedArrow);
                }
            });
        } else {
            const node = nodes.find(n => n.id === id);
            if (node) {
                const updated = { ...node, x: node.x + dx, y: node.y + dy };
                emitUpdate('node:update', updated);
            }
        }

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

                // Live Sync (Throttled) for Group Drag via Arrow
                nodes.forEach(n => {
                    if (selectedNodeIds.has(n.id)) {
                        const updated = { ...n, x: n.x + dx, y: n.y + dy };
                        emitUpdate('node:update', updated);
                    }
                });
                arrows.forEach(a => {
                    if (selectedNodeIds.has(a.id)) {
                        const updatedArrow = { ...a, start: { x: a.start.x + dx, y: a.start.y + dy }, end: { x: a.end.x + dx, y: a.end.y + dy } };
                        emitUpdate('arrow:update', updatedArrow);
                    }
                });

            } else {
                setArrows(prev => prev.map(arrow => {
                    if (arrow.id !== draggedArrowHandle.id) return arrow;

                    let updatedArrow = { ...arrow };
                    if (draggedArrowHandle.type === 'start') {
                        updatedArrow = { ...arrow, start: { x: arrow.start.x + dx, y: arrow.start.y + dy } };
                    } else if (draggedArrowHandle.type === 'end') {
                        updatedArrow = { ...arrow, end: { x: arrow.end.x + dx, y: arrow.end.y + dy } };
                    } else {
                        // Body drag
                        updatedArrow = {
                            ...arrow,
                            start: { x: arrow.start.x + dx, y: arrow.start.y + dy },
                            end: { x: arrow.end.x + dx, y: arrow.end.y + dy }
                        };
                    }
                    emitUpdate('arrow:update', updatedArrow);
                    return updatedArrow;
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

            // Emit update for the specific arrow being dragged
            // Use current state reference effectively by filtering from `arrows` state in next render or just finding it?
            // Since setArrows updates state, we can't trust `arrows` to be instantly updated here if we just did it in move.
            // But wait, move updates state. state is fresh on each render.
            // handleWrapperPointerUp happens AFTER the last move.
            // The `arrows` variable in closure might be stale? No, handleWrapperPointerUp is recreated on each render? 
            // Yes, if it's not wrapped in useCallback with deps.
            // It is NOT wrapped in useCallback in the code I see. 
            // So `arrows` is fresh.

            const arrow = arrows.find(a => a.id === draggedArrowHandle.id);
            if (arrow) {
                socket?.emit('arrow:update', arrow);
            }

            // If it was a group drag (body), we technically updated multiple items
            // But for now let's just cover the single arrow case or simple group case.
            // If dragging body of arrow that is part of a selection, we moved nodes too.
            // We should emit node updates for all selected nodes!
            if (draggedArrowHandle.type === 'body' && selectedNodeIds.has(draggedArrowHandle.id)) {
                nodes.forEach(n => {
                    if (selectedNodeIds.has(n.id)) {
                        socket?.emit('node:update', n);
                    }
                });
                // And all OTHER selected arrows
                arrows.forEach(a => {
                    if (selectedNodeIds.has(a.id) && a.id !== draggedArrowHandle.id) {
                        socket?.emit('arrow:update', a);
                    }
                });
            }


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
        setNodes(prev => {
            const next = prev.map(n => n.id === id ? { ...n, content } : n);
            const updated = next.find(n => n.id === id);
            if (updated) {
                socket?.emit('node:update', updated);
            }
            return next;
        });
    };

    // --- RENDER HELPERS ---
    // We need real DOM elements for Xarrow to attach to.
    // We will render draggable handle Divs.

    // --- SAVE / LOAD ---


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

    const handleSaveAndClear = async () => {
        await handleSave();
        setShowClearConfirm(false);
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

    // Room State
    const roomIdInputRef = useRef<HTMLInputElement>(null);

    const handleJoinRoom = () => {
        console.log("Room Dialog Rendered - checking updates");
        if (roomIdInputRef.current) {
            const id = roomIdInputRef.current.value;
            if (id.trim()) {
                setRoomId(id.trim());
            }
        }
    };



    if (!roomId) {
        return (
            <div className="flex items-center justify-center w-screen h-screen bg-slate-900" style={{ color: '#60a5fa' }}>
                <div className="p-8 bg-slate-800 rounded-lg shadow-xl border w-fit mx-auto" style={{ borderColor: '#60a5fa', borderWidth: '1px' }}>
                    <h2 className="text-2xl font-bold mb-6 text-center whitespace-nowrap" style={{ color: '#60a5fa' }}>Enter Room ID</h2>
                    <div className="mb-6 flex flex-col items-center">
                        <label className="block text-sm font-medium mb-2" style={{ color: '#60a5fa' }}>Room Number</label>
                        <input
                            ref={roomIdInputRef}
                            type="text"
                            className="w-60 px-4 py-3 bg-slate-900 rounded-md focus:outline-none transition-colors box-border text-center placeholder:text-blue-400/50"
                            style={{
                                color: '#60a5fa',
                                borderColor: '#60a5fa',
                                borderWidth: '1px'
                            }}
                            placeholder="e.g. 101"
                            onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                            autoFocus
                        />
                    </div>
                    <button
                        onClick={handleJoinRoom}
                        className="w-full font-bold py-3 px-4 rounded-md transition-colors box-border"
                        style={{
                            backgroundColor: '#60a5fa',
                            color: '#0f172a' // Dark slate for contrast
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#93c5fd'} // lighten on hover
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#60a5fa'}
                    >
                        Join Room
                    </button>
                    <p className="mt-4 text-xs text-center" style={{ color: '#60a5fa' }}>
                        Share this number with others to collaborate.
                    </p>
                </div>
            </div>
        );
    }

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
                onToggleBorders={() => {
                    const newVal = !showBorders;
                    setShowBorders(newVal);
                    socket?.emit('toggle:borders', newVal);
                }}
                isLocked={isLocked}
                onToggleLock={() => {
                    const newVal = !isLocked;
                    setIsLocked(newVal);
                    socket?.emit('toggle:lock', newVal);
                }}
                onClear={handleClearRequest}
                isMicEnabled={isMicEnabled}
                onToggleMic={toggleMic}
            />

            {/* Clear Confirmation Dialog */}
            {showClearConfirm && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-slate-800 p-8 rounded-lg shadow-2xl border border-slate-700 max-w-md w-full mx-4 text-center">
                        <h3 className="text-xl font-bold text-white mb-4">Clear Grid?</h3>
                        <p className="text-slate-300 mb-8">
                            Do you really want to delete everything?
                        </p>
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={handleClearConfirm}
                                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded font-medium transition-colors"
                            >
                                Delete
                            </button>
                            <button
                                onClick={handleSaveAndClear}
                                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-medium transition-colors"
                            >
                                Save Instead
                            </button>
                            {/* Optional Cancel - user can just click save instead if they want to 'cancel' clearing without deleting, or we can add explicit cancel? 
                                    User prompt said: "If the user selects save, then the save function... gets activated... but diagram does not get deleted." 
                                    So 'Save Instead' covers the non-destructive path. Use 'Cancel' for truly aborting?
                                    I'll add a small simple Cancel text link or X for UX safety. */}
                            <button
                                onClick={handleClearCancel}
                                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}



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
                    onTransformed={(r) => {
                        updateArrowsRef.current?.();
                        if (!isRemoteUpdate.current) {
                            const { positionX, positionY, scale } = r.instance.transformState;
                            socket?.emit('viewport:update', { x: positionX, y: positionY, scale });
                        }
                    }}
                    onPanning={(r) => {
                        updateArrowsRef.current?.();
                        // Optional: emit on panning for smoother live drag, but might be too much traffic
                        // Let's rely on onTransformed which fires after pan? onPanning fires during.
                        // For real-time, emit here.
                        if (!isRemoteUpdate.current) {
                            const { positionX, positionY, scale } = r.instance.transformState;
                            // throttle this in real app!
                            socket?.emit('viewport:update', { x: positionX, y: positionY, scale });
                        }
                    }}
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
