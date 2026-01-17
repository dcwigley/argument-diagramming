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

// In-memory state
let nodes = [];
let arrows = [];

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send current state to newly connected client
    socket.emit('init_state', { nodes, arrows });

    // Client sends its local state to hydrate server (if server is empty)
    socket.on('hydrate_state', (data) => {
        if (nodes.length === 0 && arrows.length === 0) {
            console.log('Hydrating server state from client:', socket.id);
            if (data.nodes) nodes = data.nodes;
            if (data.arrows) arrows = data.arrows;
            // Broadcast the new hydrated state to everyone (including sender, to confirm)
            io.emit('update_state', { nodes, arrows });
        }
    });

    // Handle Granular Updates
    socket.on('node:add', (node) => {
        nodes.push(node);
        socket.broadcast.emit('node:add', node);
    });

    socket.on('node:update', (updatedNode) => {
        nodes = nodes.map(n => n.id === updatedNode.id ? updatedNode : n);
        socket.broadcast.emit('node:update', updatedNode);
    });

    socket.on('node:delete', (nodeId) => {
        nodes = nodes.filter(n => n.id !== nodeId);
        socket.broadcast.emit('node:delete', nodeId);
    });

    socket.on('arrow:add', (arrow) => {
        arrows.push(arrow);
        socket.broadcast.emit('arrow:add', arrow);
    });

    socket.on('arrow:update', (updatedArrow) => {
        arrows = arrows.map(a => a.id === updatedArrow.id ? updatedArrow : a);
        socket.broadcast.emit('arrow:update', updatedArrow);
    });

    socket.on('arrow:delete', (arrowId) => {
        arrows = arrows.filter(a => a.id !== arrowId);
        socket.broadcast.emit('arrow:delete', arrowId);
    });

    // Handle Global Settings Sync
    socket.on('toggle:borders', (showBorders) => {
        socket.broadcast.emit('toggle:borders', showBorders);
    });

    socket.on('toggle:lock', (isLocked) => {
        socket.broadcast.emit('toggle:lock', isLocked);
    });

    // Handle Viewport Sync
    socket.on('viewport:update', (viewportState) => {
        socket.broadcast.emit('viewport:update', viewportState);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
