"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTimeMs = formatTimeMs;
exports.formatAudioTime = formatAudioTime;
exports.evaluateSyncQuality = evaluateSyncQuality;
__exportStar(require("./types/devices"), exports);
__exportStar(require("./types/sync"), exports);
__exportStar(require("./types/audio"), exports);
__exportStar(require("./types/network"), exports);
__exportStar(require("./types/messages"), exports);
/**
 * Format milliseconds to readable string
 */
function formatTimeMs(ms) {
    if (Math.abs(ms) < 1)
        return `${(ms * 1000).toFixed(0)}µs`;
    if (Math.abs(ms) < 1000)
        return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}
/**
 * Format track seconds into MM:SS
 */
function formatAudioTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0)
        return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
/**
 * Helper to determine sync quality classification
 */
function evaluateSyncQuality(offsetMs, rttMs) {
    const absOffset = Math.abs(offsetMs);
    if (absOffset <= 5 && rttMs <= 25)
        return 'excellent';
    if (absOffset <= 15 && rttMs <= 60)
        return 'good';
    if (absOffset <= 35 && rttMs <= 120)
        return 'fair';
    return 'poor';
}
