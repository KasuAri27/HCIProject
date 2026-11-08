import {Easing, interpolate} from 'remotion';

export const C = {deep: '#092B30', ink: '#102F34', teal: '#0F6E7C', mint: '#A7E4D9', white: '#F5F7F4', muted: '#A8C5BE', gold: '#F4CD79'};
export const ease = (f: number, a: number, b: number, from = 0, to = 1) => interpolate(f, [a,b], [from,to], {extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.bezier(0.22,1,0.36,1)});
export const linear = (f: number, a: number, b: number, from = 0, to = 1) => interpolate(f, [a,b], [from,to], {extrapolateLeft:'clamp',extrapolateRight:'clamp'});
export const font = "'Microsoft YaHei', 'Segoe UI', sans-serif";
export const mono = "'Consolas', monospace";
