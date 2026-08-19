import * as THREE_MODULE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as D3_MODULE from 'd3';

// Legacy modules still use the site-wide globals; this bridge lets them share pinned ESM dependencies.
window.THREE = { ...THREE_MODULE, OrbitControls };
window.d3 = D3_MODULE;

await import('./knowledge-map.js');
await import('./motion.js');
