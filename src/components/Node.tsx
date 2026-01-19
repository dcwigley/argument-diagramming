import React, { useState, useEffect, useRef } from 'react';
import { useTransformContext } from 'react-zoom-pan-pinch';
import { Resizable } from 're-resizable';

interface NodeProps {
    id: string;
    initialX: number;
    initialY: number;
    initialWidth?: number;
    initialHeight?: number;
    content: string;
    onDragStart: () => void;
    onDragStop: (x: number, y: number) => void;
    onDrag?: (dx: number, dy: number) => void; // New prop
    mode: 'PAN' | 'SELECT' | 'CONNECT';
    onClick: () => void;
    onChange: (content: string) => void;
    onResizeStop?: (width: number, height: number) => void;
    isSelected?: boolean;
    onContextMenu?: (e: React.MouseEvent) => void;
    showBorders: boolean;
    isLocked?: boolean;
}

export const Node: React.FC<NodeProps> = ({
    initialX, initialY, initialWidth, initialHeight, content, onDragStart, onDragStop, onDrag, mode, onClick, onChange, onResizeStop, isSelected, onContextMenu, showBorders, isLocked
}) => {
    const [pos, setPos] = useState({ x: initialX, y: initialY });
    const [size, setSize] = useState({ width: initialWidth || 200, height: initialHeight || 100 });
    const [isDragging, setIsDragging] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dragStartPos = useRef<{ x: number, y: number } | null>(null);

    // Access zoom state to correct drag deltas
    const { transformState } = useTransformContext();
    const scale = transformState.scale;

    useEffect(() => {
        setPos({ x: initialX, y: initialY });
    }, [initialX, initialY]);

    useEffect(() => {
        if (initialWidth && initialHeight) {
            setSize({ width: initialWidth, height: initialHeight });
        }
    }, [initialWidth, initialHeight]);

    const handlePointerDown = (e: React.PointerEvent) => {
        // Allow text selection and context menu inside textarea
        if ((e.target as HTMLElement).tagName.toLowerCase() === 'textarea') {
            // If it's a right click, don't do anything (let browser context menu show)
            if (e.button !== 0) return;
            // If it's a left click in textarea, we might want to drag ONLY if we are not selecting text?
            // Actually, usually grabbing the header or border is better for dragging.
            // But currently the whole div is the handle.
        }

        e.stopPropagation();
        // Only allow left click (button 0) to start drag
        if (e.button !== 0) return;

        if (mode === 'CONNECT') return;

        // Check if we clicked a resizer handle
        const target = e.target as HTMLElement;
        if (target.classList.contains('resizer-handle')) {
            return;
        }

        // Prevent movement if locked
        if (isLocked) return;

        // Start "Potential Drag"
        onDragStart();
        setIsDragging(true);
        dragStartPos.current = { x: e.clientX, y: e.clientY };

        // Capture pointer prevents text selection drag
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;

        const dx = e.movementX / scale;
        const dy = e.movementY / scale;

        setPos(p => ({
            x: p.x + dx,
            y: p.y + dy
        }));

        if (onDrag) {
            onDrag(dx, dy);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging) return;

        setIsDragging(false);
        onDragStop(pos.x, pos.y);
        e.currentTarget.releasePointerCapture(e.pointerId);

        // Check if it was a Click (minimal movement)
        if (dragStartPos.current) {
            const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
            if (dist < 5) {
                // It was a click!
                // Manually focus the textarea
                textareaRef.current?.focus();
                onClick(); // Safe to call here
            }
        }
        dragStartPos.current = null;
    };

    return (
        <div
            style={{
                position: 'absolute',
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                zIndex: isDragging || isSelected ? 50 : 10
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onContextMenu={(e) => {
                if (e.ctrlKey && onContextMenu) {
                    onContextMenu(e);
                }
            }}
            // Eat double clicks to prevent random selection if any
            onDoubleClick={(e) => e.stopPropagation()}
        >
            <Resizable
                scale={scale}
                size={{ width: size.width, height: size.height }}
                onResizeStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onResizeStop={(_e, _direction, _ref, d) => {
                    const newWidth = size.width + d.width;
                    const newHeight = size.height + d.height;
                    setSize({
                        width: newWidth,
                        height: newHeight,
                    });
                    if (onResizeStop) {
                        onResizeStop(newWidth, newHeight);
                    }
                }}
                minWidth={20}
                minHeight={20}
                className={`
                rounded-lg overflow-hidden flex flex-col
                ${isSelected
                        ? 'border-[1.5px] border-blue-500 shadow-sm shadow-blue-500/20'
                        : showBorders
                            ? 'border-[1.5px] border-blue-400 hover:border-blue-300 shadow-sm'
                            : 'border-[1.5px] border-transparent'
                    }
                ${showBorders || isSelected ? 'bg-slate-900' : 'bg-transparent'} transition-colors duration-200
            `}
                handleClasses={{
                    bottomRight: 'bg-white/20 hover:bg-white/50 rounded-sm resizer-handle',
                    right: 'resizer-handle cursor-e-resize',
                    bottom: 'resizer-handle cursor-s-resize'
                }}
                enable={{ bottomRight: true, right: true, bottom: true }}
                style={{
                    borderColor: (!showBorders) ? 'transparent' : (isSelected ? '#3b82f6' : '#60a5fa'),
                    borderWidth: (!showBorders) ? 0 : undefined,
                    boxShadow: (!showBorders) ? 'none' : undefined,
                }}
            >
                <div className={`flex-1 w-full p-3 flex`}>
                    <textarea
                        ref={textareaRef}
                        className={`flex-1 w-full h-full bg-transparent border-none appearance-none resize-none outline-none font-sans text-lg leading-relaxed ${isDragging ? 'cursor-grabbing select-none pointer-events-none' : 'cursor-text'} placeholder-slate-500`}
                        placeholder="Type...."
                        value={content}
                        onChange={(e) => onChange(e.target.value)}
                        style={{ color: '#ffffff' }}
                    // Allow propagation so parent div starts drag capture
                    />
                </div>
            </Resizable>
        </div>
    );
};
