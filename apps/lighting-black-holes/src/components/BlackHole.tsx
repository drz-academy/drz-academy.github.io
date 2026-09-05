"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from 'next/dynamic';
import packageJson from '../../package.json';

const STAR_COUNT = 200;
const STAR_COLOR = "#fff";
const STAR_SIZE = 1.2;

// Laser type definition
type Laser = {
  id: number;
  x: number;
  y: number;
  fired: boolean;
  angle: number;
  direction: 'left' | 'right'; // Direction the laser beam emerges from
};

// Function to calculate distance to screen edge
function calculateDistanceToEdge(x: number, y: number, angle: number, width: number, height: number): number {
  // Convert angle to radians
  const angleRad = (angle * Math.PI) / 180;
  
  // Calculate the four possible distances to screen edges
  const distances = [
    // Distance to top edge
    y / Math.sin(angleRad),
    // Distance to bottom edge
    (height - y) / Math.sin(angleRad),
    // Distance to left edge
    x / Math.cos(angleRad),
    // Distance to right edge
    (width - x) / Math.cos(angleRad)
  ];
  
  // Filter out negative and infinite values
  const validDistances = distances.filter(d => d > 0 && isFinite(d));
  
  // Return the minimum valid distance
  return Math.min(...validDistances);
}

// Function to calculate distance in Schwarzschild radius units
const calculateDistanceInRs = (x: number, y: number, BH_SIZE: number): number => {
  const distanceFromCenter = Math.sqrt(x * x + y * y);
  const blackHoleRadius = BH_SIZE * 0.25; // This is our Schwarzschild radius
  return distanceFromCenter / blackHoleRadius;
};

/**
 * Integrate a *photon* geodesic in the equatorial plane (θ = π/2) of
 * a Schwarzschild black hole, starting from a screen point and angle.
 *
 * All lengths are in *pixels*; we simply interpret the on-screen
 * "black-hole radius"  bhSize*0.25  as the Schwarzschild radius r_s.
 *
 * The geodesic equations used are
 *   r'   = p_r
 *   φ'   =  L / r²
 *   p_r' = -½ dV_eff/dr ,   with  V_eff = f L² / r² ,  f = 1 - r_s/r
 *
 * where ( ' ) denotes d/dλ (affine parameter) and
 *   L = r₀² φ̇₀  is fixed by the initial direction.
 */
const calculateLightPath = (
  startX: number,
  startY: number,
  angleDeg: number,
  width: number,
  height: number,
  bhSize: number,
  zoom: number,
  gravityEnabled: boolean
): { x: number; y: number; distToCenter: number }[] => {
  /* ------------ helpers -------------------------------------------------- */
  const rk4 = (
    y: [number, number, number],       // [r, φ, p_r]
    h: number,
    derivs: (y: [number, number, number]) => [number, number, number]
  ): [number, number, number] => {
    const k1 = derivs(y);
    const k2 = derivs([
      y[0] + 0.5 * h * k1[0],
      y[1] + 0.5 * h * k1[1],
      y[2] + 0.5 * h * k1[2],
    ]);
    const k3 = derivs([
      y[0] + 0.5 * h * k2[0],
      y[1] + 0.5 * h * k2[1],
      y[2] + 0.5 * h * k2[2],
    ]);
    const k4 = derivs([
      y[0] + h * k3[0],
      y[1] + h * k3[1],
      y[2] + h * k3[2],
    ]);
    return [
      y[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      y[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      y[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    ];
  };

  /* ------------ screen → BH-centric coordinates -------------------------- */
  const centerX = width / 2;
  const centerY = height / 2;
  const rs = bhSize * 0.25;                       // Schwarzschild radius
  const massFactor = gravityEnabled ? 1 : 0;      // Mass factor for gravity
  const effectiveRs = rs * massFactor;            // Effective Schwarzschild radius
  const relX0 = startX - centerX;
  const relY0 = startY - centerY;

  // Polar coords of the starting point
  const r0 = Math.hypot(relX0, relY0);
  const phi0 = Math.atan2(relY0, relX0);

  // Initial *Euclidean* direction
  const angle = (angleDeg * Math.PI) / 180;
  const vx = Math.cos(angle);
  const vy = Math.sin(angle);

  // Components along {e_r, e_φ}
  const n_r = vx * Math.cos(phi0) + vy * Math.sin(phi0);
  const n_phi = -vx * Math.sin(phi0) + vy * Math.cos(phi0);

  // Affine-parameter scale κ is arbitrary – choose 1
  const p_r0 = n_r;                // ṙ(0)
  const L = n_phi * r0;          // conserved angular momentum

  /* ------------ derivative function -------------------------------------- */
  const derivs = ([r, _phi, p_r]: [number, number, number]):
    [number, number, number] => {
    const _f = 1 - effectiveRs / r;
    const dVdr = L * L * (-2 / (r ** 3) + (3 * effectiveRs) / (r ** 4));
    return [
      /* dr/dλ   */ p_r,
      /* dφ/dλ   */ L / (r * r),
      /* dp_r/dλ */ -0.5 * dVdr,
    ];
  };

  /* ------------ integration loop ----------------------------------------- */
  const h = rs * 0.01;           // Smaller step size for better accuracy
  const maxSteps = 4000;         // Increased max steps for longer paths
  const points: { x: number; y: number; distToCenter: number }[] = [];

  // Calculate maximum distance based on zoom
  const maxDistance = Math.max(width, height) * (1.5 / zoom);

  let yState: [number, number, number] = [r0, phi0, p_r0];

  for (let step = 0; step < maxSteps; step++) {
    const [r, phi, _pr] = yState;

    // stop if we cross the horizon
    if (r <= effectiveRs * 1.001) break;

    // convert back to screen coords
    const xPix = r * Math.cos(phi) + centerX;
    const yPix = r * Math.sin(phi) + centerY;

    // Calculate distance from center
    const distFromCenter = Math.hypot(xPix - centerX, yPix - centerY);

    // stop if we exceed maximum distance or leave the canvas
    const factor = 1/zoom;
    if (distFromCenter > maxDistance || 
        xPix < -factor*width || xPix > width * factor || 
        yPix < -factor*height || yPix > height * factor) break;

    points.push({
      x: xPix,
      y: yPix,
      distToCenter: zoom,
    });

    // one RK4 step
    yState = rk4(yState, h, derivs);
  }

  return points;
};

// Function to normalize angle to 0-360 range
const normalizeAngle = (angle: number): number => {
  return ((angle % 360) + 360) % 360;
};

// Function to generate stars with consistent positions
const generateStars = (width: number, height: number) => {
  return Array.from({ length: STAR_COUNT }, (_, i) => {
    // Use a deterministic seed based on the index
    const seed = i * 16807 % 2147483647;
    const x = (seed % width);
    const y = ((seed * 16807) % 2147483647) % height;
    const r = ((seed * 16807) % 2147483647) % STAR_SIZE + 0.2;
    const o = ((seed * 16807) % 2147483647) % 0.7 + 0.3;
    return { x, y, r, o };
  });
};

function BlackHoleComponent() {
  const [zoom, setZoom] = useState(1);
  const minZoom = 0.2;
  const maxZoom = 2.5;
  const [gravityEnabled, setGravityEnabled] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [editingLaserId, setEditingLaserId] = useState<number | null>(null);
  const [tempInputValues, setTempInputValues] = useState<{ x: string; y: string; angle: string }>({ x: '', y: '', angle: '' });
  const [size, setSize] = useState({ width: 800, height: 800 });
  const [stars, setStars] = useState<Array<{ x: number; y: number; r: number; o: number }>>([]);
  const [isClient, setIsClient] = useState(false);
  const [lasers, setLasers] = useState<Laser[]>([]);
  const [nextId, setNextId] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggedLaserId, setDraggedLaserId] = useState<number | null>(null);
  const [rotatingLaserId, setRotatingLaserId] = useState<number | null>(null);
  const [lastMouseX, setLastMouseX] = useState<number | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [wasPanning, setWasPanning] = useState(false);
  const [language, setLanguage] = useState<'en' | 'es'>('es');

  // Translations
  const translations = useMemo(() => ({
    en: {
      title: "Black-hole optics",
      byline: "By Jorge I. Zuluaga, Dr. Z",
      hostPrefix: "An app",
      cleanAll: "Clean All",
      gravitation: "Gravitation",
      showGrid: "Show Grid",
      howToUse: "How to Use",
      instructions: [
        "• Click anywhere to place a laser",
        "• Shift + Click to place laser at 90°",
        "• Right-click and drag to rotate",
        "• Left-click and drag to move",
        "• Double-click to remove a laser",
        "• Shift + Right-click to edit coordinates",
        "• Use mouse wheel to zoom in/out",
        "• Alt + drag or middle-click drag to pan",
        "• Toggle gravitation to see light bending"
      ],
      zoomIn: "+",
      zoomOut: "-",
      credits: "Developed by Jorge I. Zuluaga (Dr. Z) in Cursor with the assistance of ChatGPT 4.5",
      version: "Version",
      latestCommit: "Latest commit:",
      laserNumber: "Laser #",
      coordinates: "Coordinates (in Rs units)",
      close: "×"
    },
    es: {
      title: "Óptica de agujeros negros",
      byline: "Por Jorge I. Zuluaga, Dr. Z",
      hostPrefix: "Una app",
      cleanAll: "Limpiar Todo",
      gravitation: "Gravitación",
      showGrid: "Mostrar Cuadrícula",
      howToUse: "Cómo Usar",
      instructions: [
        "• Haz clic en cualquier lugar para colocar un láser",
        "• Shift + Clic para colocar láser a 90°",
        "• Clic derecho y arrastra para rotar",
        "• Clic izquierdo y arrastra para mover",
        "• Doble clic para eliminar un láser",
        "• Shift + Clic derecho para editar coordenadas",
        "• Usa la rueda del ratón para zoom",
        "• Alt + arrastra o clic central para desplazar",
        "• Activa gravitación para ver curvatura de luz"
      ],
      zoomIn: "+",
      zoomOut: "-",
      credits: "Desarrollado por Jorge I. Zuluaga (Dr. Z) en Cursor con la asistencia de ChatGPT 4.5",
      version: "Versión",
      latestCommit: "Última confirmación:",
      laserNumber: "Láser #",
      coordinates: "Coordenadas (en unidades Rs)",
      close: "×"
    }
  }), []);

  const t = translations[language];

  // Memoize BH_SIZE calculation
  const BH_SIZE = useMemo(() => Math.min(size.width, size.height, 600), [size.width, size.height]);
  const rs = useMemo(() => BH_SIZE * 0.25, [BH_SIZE]); // Schwarzschild radius in pixels

  const playgroundWidth = useMemo(() => size.width * 0.8, [size.width]);
  const playgroundHeight = useMemo(() => size.height, [size.height]);
  
  const BH_CENTER = useMemo(() => ({
    x: playgroundWidth / 2,
    y: playgroundHeight / 2,
  }), [playgroundWidth, playgroundHeight]);
  
  const gridSpacing = useMemo(() => 0.5 * rs * zoom, [rs, zoom]);

  // Initialize client-side state
  useEffect(() => {
    setIsClient(true);
    const initialSize = { width: window.innerWidth, height: window.innerHeight };
    setSize(initialSize);
    setStars(generateStars(initialSize.width, initialSize.height));
  }, []);

  // Handle window resize
  useEffect(() => {
    if (!isClient) return;

    const handleResize = () => {
      const newSize = { width: window.innerWidth, height: window.innerHeight };
      setSize(newSize);
      setStars(generateStars(newSize.width, newSize.height));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isClient]);

  // Optimize wheel handler
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setZoom((z) => {
      let next = z - e.deltaY * 0.001;
      if (next < minZoom) next = minZoom;
      if (next > maxZoom) next = maxZoom;
      return next;
    });
  }, [minZoom, maxZoom]);

  // Optimize canvas click handler
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Reset wasPanning flag first, then check if we should skip this click
    if (wasPanning) {
      setWasPanning(false);
      return; // Skip this click if we were just panning
    }
    
    if (isDragging || isPanning) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const relativeX = (x - BH_CENTER.x - panOffset.x) / zoom;
    const relativeY = (y - BH_CENTER.y - panOffset.y) / zoom;
    
    const distanceFromCenter = Math.hypot(relativeX, relativeY);
    const blackHoleRadius = rs / zoom;
    
    if (distanceFromCenter > blackHoleRadius) {
      const newLaser: Laser = {
        id: nextId,
        x: relativeX,
        y: relativeY,
        fired: true,
        angle: e.shiftKey ? 90 : 0,
        direction: 'right',
      };
      setLasers((prev) => [...prev, newLaser]);
      setNextId((prev) => prev + 1);
    }
  }, [isDragging, isPanning, wasPanning, zoom, BH_SIZE, nextId, BH_CENTER, rs, panOffset]);

  // Optimize laser handlers
  const handleLaserDoubleClick = useCallback((id: number) => {
    setLasers((prev) => prev.filter((laser) => laser.id !== id));
  }, []);

  const handleLaserMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, id: number) => {
    e.stopPropagation();
    
    if (e.button === 0) {
      setIsDragging(true);
      setDraggedLaserId(id);
      const rect = e.currentTarget.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
    else if (e.button === 2) {
      e.preventDefault();
      if (e.shiftKey) {
        const laser = lasers.find(l => l.id === id);
        if (laser) {
          const rs = BH_SIZE * 0.25;
          const xInRs = laser.x / rs;
          const yInRs = -laser.y / rs;
          // Convert from screen coordinates to physics coordinates
          // Screen: 0°=right, 90°=down, 180°=left, 270°=up
          // Physics: 0°=right, 90°=up, 180°=left, -90°=down
          let displayAngle = -laser.angle;
          // Normalize to [-180, 180] range
          while (displayAngle > 180) displayAngle -= 360;
          while (displayAngle <= -180) displayAngle += 360;
          setTempInputValues({
            x: xInRs.toFixed(2),
            y: yInRs.toFixed(2),
            angle: displayAngle.toFixed(1)
          });
          setEditingLaserId(id);
        }
      } else {
        setRotatingLaserId(id);
        setLastMouseX(e.clientX);
      }
    }
  }, [lasers, zoom, BH_SIZE]);

  const handleLaserEdit = useCallback((field: 'x' | 'y' | 'angle', value: string) => {
    if (editingLaserId !== null) {
      // Update temporary input value immediately
      setTempInputValues(prev => ({
        ...prev,
        [field]: value
      }));
      
      // Only update laser if value is a valid number
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        const rs = BH_SIZE * 0.25;
        
        setLasers(prev =>
          prev.map(laser =>
            laser.id === editingLaserId
              ? {
                  ...laser,
                  ...(field === 'x' ? { x: numValue * rs } : {}),
                  ...(field === 'y' ? { y: -numValue * rs } : {}), // Negate Y to convert back to screen coordinates
                  ...(field === 'angle' ? { 
                    // Convert from physics coordinates back to screen coordinates
                    // Physics: 0°=right, 90°=up, 180°=left, -90°=down
                    // Screen: 0°=right, 90°=down, 180°=left, 270°=up
                    angle: ((-numValue % 360) + 360) % 360
                  } : {})
                }
              : laser
          )
        );
      }
    }
  }, [editingLaserId, BH_SIZE]);

  const handleCloseLaserEdit = useCallback(() => {
    setEditingLaserId(null);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (rotatingLaserId !== null && lastMouseX !== null) {
      const deltaX = e.clientX - lastMouseX;
      setLasers((prev) =>
        prev.map((laser) =>
          laser.id === rotatingLaserId
            ? { ...laser, angle: normalizeAngle(laser.angle + deltaX * 0.5) }
            : laser
        )
      );
      setLastMouseX(e.clientX);
    }
    else if (isDragging && draggedLaserId !== null) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const relativeX = (x - BH_CENTER.x - panOffset.x) / zoom;
      const relativeY = (y - BH_CENTER.y - panOffset.y) / zoom;
      
      setLasers((prev) =>
        prev.map((laser) =>
          laser.id === draggedLaserId ? { ...laser, x: relativeX, y: relativeY } : laser
        )
      );
    }
    else if (isPanning) {
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      setPanOffset({ x: deltaX, y: deltaY });
    }
  }, [rotatingLaserId, lastMouseX, isDragging, draggedLaserId, zoom, isPanning, panStart, BH_CENTER, panOffset]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle mouse or Alt+Left click for panning
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  }, [panOffset]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(false);
      setDraggedLaserId(null);
      // Stop panning if left mouse button is released (for Alt+drag panning)
      if (isPanning) {
        setIsPanning(false);
        setWasPanning(true); // Mark that we were just panning
      }
    }
    else if (e.button === 2) {
      setRotatingLaserId(null);
      setLastMouseX(null);
    }
    else if (e.button === 1) {
      // Stop panning if middle mouse button is released
      if (isPanning) {
        setIsPanning(false);
        setWasPanning(true); // Mark that we were just panning
      }
    }
  }, [isPanning]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleCleanAll = useCallback(() => {
    setLasers([]);
  }, []);

  // Don't render anything until we're on the client
  if (!isClient) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ width: "100vw", height: "100vh" }}
    >
      {/* Sidebar */}
      <div 
        className="absolute left-0 top-0 h-full w-[20%] bg-black/50 backdrop-blur-sm border-r border-white/20 p-6 z-50 flex min-h-0 flex-col overflow-y-auto"
        style={{ pointerEvents: "auto" }}
      >
        <div className="mb-6 shrink-0">
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo.png`}
            alt=""
            className="mb-3 w-full max-w-[180px] object-contain opacity-90"
          />
          <h1 className="text-white text-2xl font-bold leading-tight">{t.title}</h1>
          <p className="mt-1.5 text-xs leading-snug text-white/55">{t.byline}</p>
          <p className="mt-1 text-[0.68rem] tracking-wide text-white/40">
            {t.hostPrefix}{" "}
            <a
              href="https://drz-academy.github.io/#apps"
              target="_blank"
              rel="noreferrer"
              className="text-white/55 hover:text-white hover:underline"
            >
              Dr.Z
            </a>
            {" / "}
            <a
              href="https://seap-udea.github.io/"
              target="_blank"
              rel="noreferrer"
              className="text-white/55 hover:text-white hover:underline"
            >
              seap-udea
            </a>
          </p>
        </div>
        
        {/* Controls */}
        <div className="mb-6 shrink-0 space-y-4">
          <button
            className="w-full bg-white/10 text-white border border-white/30 rounded-lg px-4 py-2 text-sm hover:bg-white/20 transition"
            onClick={handleCleanAll}
          >
            {t.cleanAll}
          </button>
          {/* Gravity Toggle Button */}
          <div className="flex items-center justify-between">
            <span className="text-white/80 text-sm">{t.gravitation}</span>
            <button
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                gravityEnabled ? 'bg-blue-500' : 'bg-gray-600'
              }`}
              onClick={() => setGravityEnabled(!gravityEnabled)}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                  gravityEnabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
          {/* Grid Toggle Button */}
          <div className="flex items-center justify-between">
            <span className="text-white/80 text-sm">{t.showGrid}</span>
            <button
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                showGrid ? 'bg-green-500' : 'bg-gray-600'
              }`}
              onClick={() => setShowGrid(!showGrid)}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                  showGrid ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="mb-6 shrink-0 text-white/80">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t.howToUse}</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setLanguage('en')}
                className={`text-lg hover:scale-110 transition-transform ${language === 'en' ? 'opacity-100' : 'opacity-60 hover:opacity-80'}`}
                title="English"
              >
                🇯🇲
              </button>
              <button
                onClick={() => setLanguage('es')}
                className={`text-lg hover:scale-110 transition-transform ${language === 'es' ? 'opacity-100' : 'opacity-60 hover:opacity-80'}`}
                title="Español"
              >
                🇨🇴
              </button>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {t.instructions.map((instruction, index) => (
              <li key={index}>{instruction}</li>
            ))}
          </ul>
        </div>

        {/* Zoom controls */}
        <div className="mb-6 flex shrink-0 gap-4">
          <button
            className="w-full bg-white/10 text-white border border-white/30 rounded-lg px-4 py-2 text-xl hover:bg-white/20 transition"
            onClick={() => setZoom((z) => Math.max(minZoom, z - 0.2))}
          >
            {t.zoomOut}
          </button>
          <button
            className="w-full bg-white/10 text-white border border-white/30 rounded-lg px-4 py-2 text-xl hover:bg-white/20 transition"
            onClick={() => setZoom((z) => Math.min(maxZoom, z + 0.2))}
          >
            {t.zoomIn}
          </button>
        </div>

        {/* Dr. Z Logo */}
        <div className="flex shrink-0 justify-center">
          <img 
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/drz.png`}
            alt="Dr. Z Logo" 
            className="w-24 h-24 object-contain opacity-80 hover:opacity-100 transition-opacity"
          />
        </div>
        <div className="flex shrink-0 justify-center text-white/30" style={{ fontSize: '10px' }}>
          <center><i>{language === 'en' ? 'Developed by' : 'Desarrollado por'} <a href="https://drz.academy" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white">Jorge I. Zuluaga (Dr. Z)</a> {language === 'en' ? 'with the assistance of AI and the suggestions and tests of relativity students (thanks!)' : 'con la asistencia de IA y las sugerencias y pruebas de estudiantes de relatividad (¡gracias!)'}</i></center>
        </div>
        
        {/* Version and Commit Info */}
        <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
          <div className="text-center text-white/50 text-xs space-y-1">
            <div className="font-mono">{t.version} {packageJson.version}</div>
            <div className="font-mono">{t.latestCommit} {new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'es-ES', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}</div>
          </div>
        </div>
      </div>

      {/* Playground area */}
      <div
        className="absolute left-[20%] top-0 w-[80%] h-full"
        onWheel={handleWheel}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        tabIndex={0}
        style={{
          cursor: isPanning ? 'grabbing' : (panOffset.x !== 0 || panOffset.y !== 0 ? 'grab' : 'default')
        }}
      >


        {/* Starry background - only render when on client */}
        {isClient && (
          <svg
            className="absolute inset-0 w-full h-full z-0"
            width={size.width}
            height={size.height}
            style={{ display: "block" }}
          >
            {/* Grid lines */}
            {showGrid && (
              <>
                <defs>
                  <pattern id="grid" width={gridSpacing} height={gridSpacing} patternUnits="userSpaceOnUse" x={(BH_CENTER.x + panOffset.x) % gridSpacing} y={(BH_CENTER.y + panOffset.y) % gridSpacing}>
                    <path d={`M ${gridSpacing} 0 L 0 0 0 ${gridSpacing}`} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                
                {/* Grid tick labels */}
                {(() => {
                  const labels = [];
                  const maxDistance = Math.max(playgroundWidth, playgroundHeight) / 2;
                  const step = 0.5; // Step in Rs units
                  const maxRs = Math.ceil(maxDistance / (rs * zoom));
                  
                  for (let i = -maxRs; i <= maxRs; i += step) {
                    const pixelDistance = i * rs * zoom;
                    
                    // X-axis labels at the bottom
                    const xPos = BH_CENTER.x + panOffset.x + pixelDistance;
                    if (xPos >= 0 && xPos <= playgroundWidth) {
                      labels.push(
                        <text
                          key={`x-${i}`}
                          x={xPos}
                          y={playgroundHeight - 10}
                          fill="rgba(255,255,255,0.7)"
                          fontSize="10"
                          textAnchor="middle"
                          fontFamily="monospace"
                          style={{ userSelect: "none", pointerEvents: "none" }}
                        >
                          {i.toFixed(1)}
                        </text>
                      );
                    }
                    
                    // Y-axis labels at the left border (negative because Y increases downward)
                    const yPos = BH_CENTER.y + panOffset.y + pixelDistance;
                    if (yPos >= 0 && yPos <= playgroundHeight) {
                      labels.push(
                        <text
                          key={`y-${i}`}
                          x={10}
                          y={yPos + 4}
                          fill="rgba(255,255,255,0.7)"
                          fontSize="10"
                          textAnchor="start"
                          fontFamily="monospace"
                          style={{ userSelect: "none", pointerEvents: "none" }}
                        >
                          {(-i).toFixed(1)}
                        </text>
                      );
                    }
                  }
                  
                  return labels;
                })()}
              </>
            )}
            
            {stars.map((star, i) => (
              <circle
                key={i}
                cx={star.x}
                cy={star.y}
                r={star.r}
                fill={STAR_COLOR}
                opacity={star.o}
              />
            ))}
          </svg>
        )}

        {/* Dashed ring */}
        <div
          className="absolute left-1/2 top-1/2 z-10"
          style={{
            transform: `translate(calc(-50% + ${panOffset.x}px), calc(-50% + ${panOffset.y}px)) scale(${zoom})`,
            transition: isPanning ? "none" : "transform 0.2s cubic-bezier(.4,2,.6,1)",
          }}
        >
          <svg width={BH_SIZE} height={BH_SIZE}>
            <circle
              cx={BH_SIZE / 2}
              cy={BH_SIZE / 2}
              r={BH_SIZE * 0.25}
              fill="none"
              stroke="#fff"
              strokeWidth={BH_SIZE * 0.006}
              strokeDasharray={`${BH_SIZE * 0.01} ${BH_SIZE * 0.01}`}
              opacity={0.9}
            />
          </svg>
        </div>

        {/* Placed lasers */}
        <div
          className="absolute left-1/2 top-1/2 z-20"
          style={{
            transform: `translate(calc(-50% + ${panOffset.x}px), calc(-50% + ${panOffset.y}px)) scale(${zoom})`,
            transition: isPanning ? "none" : "transform 0.2s cubic-bezier(.4,2,.6,1)",
            pointerEvents: "auto",
          }}
        >
          {lasers.map((laser) => {
            // Calculate the distance to the screen edge
            const _distance = calculateDistanceToEdge(
              laser.x + size.width / 2,
              laser.y + size.height / 2,
              laser.angle,
              size.width,
              size.height
            );
            
            // Calculate distance in Schwarzschild radius units
            const _distanceInRs = calculateDistanceInRs(laser.x, laser.y, BH_SIZE);
            
            return (
              <div
                key={laser.id}
                className="absolute"
                style={{
                  left: laser.x,
                  top: laser.y,
                  transform: "translate(-50%, -50%)",
                  cursor: "pointer",
                  pointerEvents: "auto",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleLaserDoubleClick(laser.id);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleLaserMouseDown(e, laser.id);
                }}
              >
                <div
                  className="w-6 h-3 bg-cyan-500"
                  style={{
                    transform: `rotate(${laser.angle}deg)`,
                    pointerEvents: "auto",
                  }}
                />
                {/* Highlight marks for laser being edited */}
                {editingLaserId === laser.id && (
                  <>
                    {/* Corner marks */}
                    <div className="absolute -top-3 -left-3 w-2 h-2 border-t-2 border-l-2 border-yellow-400"></div>
                    <div className="absolute -top-3 -right-3 w-2 h-2 border-t-2 border-r-2 border-yellow-400"></div>
                    <div className="absolute -bottom-3 -left-3 w-2 h-2 border-b-2 border-l-2 border-yellow-400"></div>
                    <div className="absolute -bottom-3 -right-3 w-2 h-2 border-b-2 border-r-2 border-yellow-400"></div>
                    {/* Pulsing outline */}
                    <div className="absolute -inset-2 border border-yellow-400 rounded animate-pulse"></div>
                  </>
                )}
                {laser.fired && (
                  <div
                    className="absolute top-1/2 left-1/2"
                    style={{
                      transform: `translate(-50%, -50%)`,
                      transformOrigin: 'center center',
                      pointerEvents: "none",
                    }}
                  >
                    {calculateLightPath(
                      laser.x + size.width / 2,
                      laser.y + size.height / 2,
                      laser.angle,
                      size.width,
                      size.height,
                      BH_SIZE,
                      zoom,
                      gravityEnabled
                    ).map((point, index, array) => {
                      const nextPoint = array[index + 1];
                      
                      return (
                        <div key={index}>
                          {/* Draw line to next point if it exists */}
                          {nextPoint && (
                            <div
                              className="absolute bg-red-500"
                              style={{
                                left: `${point.x - (laser.x + size.width / 2)}px`,
                                top: `${point.y - (laser.y + size.height / 2)}px`,
                                width: `${Math.hypot(
                                  nextPoint.x - point.x,
                                  nextPoint.y - point.y
                                )}px`,
                                height: '1px',
                                transformOrigin: '0 0',
                                transform: `rotate(${Math.atan2(
                                  nextPoint.y - point.y,
                                  nextPoint.x - point.x
                                )}rad)`,
                              }}
                            />
                          )}
                          {/* Draw point */}
                          <div
                            className="absolute w-0.5 h-0.5 bg-red-500 rounded-full"
                            style={{
                              left: `${point.x - (laser.x + size.width / 2)}px`,
                              top: `${point.y - (laser.y + size.height / 2)}px`,
                              transform: 'translate(-50%, -50%)',
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Edit dialog - fixed at top-right corner */}
        {editingLaserId !== null && (() => {
          const laser = lasers.find(l => l.id === editingLaserId);
          if (!laser) return null;
          
          const rs = BH_SIZE * 0.25;
          const xInRs = laser.x / rs;
          const yInRs = -laser.y / rs; // Negate Y to match physics convention (positive up)
          
          return (
            <div
              className="absolute top-4 right-4 z-50"
              style={{
                pointerEvents: "auto"
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="bg-black/90 p-4 rounded-lg border border-white/20 backdrop-blur-sm min-w-[200px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-white/80 text-sm font-medium">
                      {t.laserNumber}{laser.id}
                    </div>
                    <button
                      onClick={handleCloseLaserEdit}
                      className="text-white/60 hover:text-white/90 text-lg leading-none"
                      title={language === 'en' ? 'Close' : 'Cerrar'}
                    >
                      {t.close}
                    </button>
                  </div>
                  <div className="text-white/60 text-xs mb-2">
                    {t.coordinates}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-white/80 text-sm w-12">X:</span>
                    <input
                      type="number"
                      value={tempInputValues.x}
                      onChange={(e) => handleLaserEdit('x', e.target.value)}
                      className="w-24 bg-white/10 text-white text-sm px-3 py-1 rounded border border-white/20 focus:border-blue-400 focus:outline-none"
                      step="0.1"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-white/80 text-sm w-12">Y:</span>
                    <input
                      type="number"
                      value={tempInputValues.y}
                      onChange={(e) => handleLaserEdit('y', e.target.value)}
                      className="w-24 bg-white/10 text-white text-sm px-3 py-1 rounded border border-white/20 focus:border-blue-400 focus:outline-none"
                      step="0.1"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-white/80 text-sm w-12">Angle:</span>
                    <input
                      type="number"
                      value={tempInputValues.angle}
                      onChange={(e) => handleLaserEdit('angle', e.target.value)}
                      className="w-24 bg-white/10 text-white text-sm px-3 py-1 rounded border border-white/20 focus:border-blue-400 focus:outline-none"
                      step="0.1"
                    />
                    <span className="text-white/60 text-xs">°</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Black hole disk */}
        <div
          className="absolute left-1/2 top-1/2 z-30"
          style={{
            transform: `translate(calc(-50% + ${panOffset.x}px), calc(-50% + ${panOffset.y}px)) scale(${zoom})`,
            transition: isPanning ? "none" : "transform 0.2s cubic-bezier(.4,2,.6,1)",
            pointerEvents: "none",
          }}
        >
          <svg width={BH_SIZE} height={BH_SIZE}>
            <circle
              cx={BH_SIZE / 2}
              cy={BH_SIZE / 2}
              r={BH_SIZE * 0.25}
              fill="black"
              filter="url(#blur)"
            />
            <defs>
              <filter id="blur">
                <feGaussianBlur stdDeviation={BH_SIZE * 0.006} />
              </filter>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  );
}

// Export a dynamically loaded version of the component with SSR disabled
export default dynamic(() => Promise.resolve(BlackHoleComponent), {
  ssr: false
}); 