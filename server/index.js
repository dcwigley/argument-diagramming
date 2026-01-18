const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // In production, replace with specific domain
        methods: ["GET", "POST"]
    }
});

// In-memory state: Map<roomId, { nodes: [], arrows: [] }>
const rooms = new Map();

const getRoomState = (roomId) => {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, { nodes: [], arrows: [] });
    }
    return rooms.get(roomId);
};

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        socket.data.roomId = roomId;
        console.log(`Client ${socket.id} joined room ${roomId}`);

        const roomState = getRoomState(roomId);
        socket.emit('init_state', roomState);
    });

    // Client sends its local state to hydrate server (if server is empty)
    // NOTE: This logic assumes the client wants to seed the ROOM if it's empty.
    socket.on('hydrate_state', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;

        const roomState = getRoomState(roomId);

        if (roomState.nodes.length === 0 && roomState.arrows.length === 0) {
            console.log(`Hydrating room ${roomId} state from client:`, socket.id);
            if (data.nodes) roomState.nodes = data.nodes;
            if (data.arrows) roomState.arrows = data.arrows;
            // Broadcast the new hydrated state to everyone in the room
            io.to(roomId).emit('update_state', roomState);
        }
    });

    // Handle Granular Updates
    socket.on('node:add', (node) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const roomState = getRoomState(roomId);
        roomState.nodes.push(node);
        socket.to(roomId).emit('node:add', node);
    });

    socket.on('node:update', (updatedNode) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const roomState = getRoomState(roomId);
        roomState.nodes = roomState.nodes.map(n => n.id === updatedNode.id ? updatedNode : n);
        socket.to(roomId).emit('node:update', updatedNode);
    });

    socket.on('node:delete', (nodeId) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const roomState = getRoomState(roomId);
        roomState.nodes = roomState.nodes.filter(n => n.id !== nodeId);
        socket.to(roomId).emit('node:delete', nodeId);
    });

    socket.on('arrow:add', (arrow) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const roomState = getRoomState(roomId);
        roomState.arrows.push(arrow);
        socket.to(roomId).emit('arrow:add', arrow);
    });

    socket.on('arrow:update', (updatedArrow) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const roomState = getRoomState(roomId);
        roomState.arrows = roomState.arrows.map(a => a.id === updatedArrow.id ? updatedArrow : a);
        socket.to(roomId).emit('arrow:update', updatedArrow);
    });

    socket.on('arrow:delete', (arrowId) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const roomState = getRoomState(roomId);
        roomState.arrows = roomState.arrows.filter(a => a.id !== arrowId);
        socket.to(roomId).emit('arrow:delete', arrowId);
    });

    socket.on('room:clear', () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const roomState = getRoomState(roomId);
        roomState.nodes = [];
        roomState.arrows = [];
        socket.to(roomId).emit('room:clear');
    });

    // Handle Global Settings Sync
    socket.on('toggle:borders', (showBorders) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        socket.to(roomId).emit('toggle:borders', showBorders);
    });

    socket.on('toggle:lock', (isLocked) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        socket.to(roomId).emit('toggle:lock', isLocked);
    });

    // Handle Viewport Sync
    socket.on('viewport:update', (viewportState) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        socket.to(roomId).emit('viewport:update', viewportState);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
