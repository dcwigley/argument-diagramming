import React from 'react';
import { Plus, ArrowUpRight, Download, Upload, Square } from 'lucide-react';

interface ToolbarProps {
    onAddNode: () => void;
    onAddArrow: () => void;
    onSave: () => void;
    onLoad: () => void;
    showBorders: boolean;
    onToggleBorders: () => void;
    isLocked: boolean;
    onToggleLock: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onAddNode, onAddArrow, onSave, onLoad, showBorders, onToggleBorders, isLocked, onToggleLock }) => {
    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 h-14 bg-secondary/80 backdrop-blur-md border border-white/10 rounded-full shadow-2xl flex items-center px-4 gap-2 z-50">


            <button
                onClick={onAddNode}
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Add Text Box"
            >
                <Plus size={20} />
            </button>

            <button
                onClick={onAddArrow}
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Add Arrow"
            >
                <ArrowUpRight size={20} />
            </button>

            <div className="w-px h-6 bg-white/10 mx-1" />

            <button
                onClick={onToggleBorders}
                className={`p-2 rounded-full transition-colors ${showBorders ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Toggle Borders"
            >
                <Square size={20} />
            </button>

            <button
                onClick={onToggleLock}
                className={`p-2 rounded-full transition-colors ${isLocked ? 'bg-white text-black hover:bg-slate-200' : 'text-slate-400 hover:text-white'}`}
                title="Toggle Lock Movement"
            >
                <Square size={20} fill={isLocked ? "black" : "currentColor"} />
            </button>

            <div className="w-px h-6 bg-white/10 mx-1" />

            <button
                onClick={onSave}
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Save Diagram"
            >
                <Download size={20} />
            </button>

            <button
                onClick={onLoad}
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Load Diagram"
            >
                <Upload size={20} />
            </button>

        </div>
    );
};
