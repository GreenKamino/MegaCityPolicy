import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- CONFIGURATION ---
const SCENE_DURATIONS = [
  4000, // 0: Title
  4000, // 1: 270 Districts
  4000, // 2: 980K Citizens
  4000, // 3: Command Economy
  4000, // 4: 5 Factions
  5000, // 5: Total Control
  5000, // 6: End Card
];

export default function MegacityTrailer() {
  const [currentScene, setCurrentScene] = useState(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const advanceScene = () => {
      setCurrentScene((prev) => (prev + 1) % SCENE_DURATIONS.length);
    };

    timeout = setTimeout(advanceScene, SCENE_DURATIONS[currentScene]);
    return () => clearTimeout(timeout);
  }, [currentScene]);

  return (
    <div className="w-full h-screen bg-[#0A0F0A] overflow-hidden relative font-sans text-[#00FF41] select-none flex items-center justify-center">
      {/* PERSISTENT LAYERS */}
      <div className="absolute inset-0 z-0 opacity-20">
        <motion.div 
          className="w-full h-full"
          animate={{
            background: currentScene % 2 === 0 
              ? 'radial-gradient(circle at 50% 50%, rgba(0,255,65,0.15) 0%, rgba(10,15,10,1) 100%)'
              : 'radial-gradient(circle at 50% 50%, rgba(0,150,40,0.15) 0%, rgba(10,15,10,1) 100%)'
          }}
          transition={{ duration: 2 }}
        />
      </div>
      
      {/* Glitch Grid Background */}
      <div className="absolute inset-0 z-0 opacity-10 flex flex-wrap" style={{ backgroundSize: '50px 50px', backgroundImage: 'linear-gradient(rgba(0, 255, 65, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 65, 0.2) 1px, transparent 1px)' }}>
      </div>

      <div className="scanlines z-50"></div>
      <div className="vignette z-40"></div>

      {/* Frame / HUD */}
      <div className="absolute inset-4 border border-[#00FF41]/30 z-30 pointer-events-none flex flex-col justify-between p-4">
        <div className="flex justify-between items-start text-xs opacity-50">
          <div>SYS.SEC.CMD // v0.9.4.EARLY_ACCESS</div>
          <div>REC &bull; 00:00:{currentScene * 4 + 1}</div>
        </div>
        <div className="flex justify-between items-end text-xs opacity-50">
          <div>LAT: 45.92 / LON: 12.04</div>
          <div>[ OVERRIDE ENABLED ]</div>
        </div>
      </div>

      {/* SCENES */}
      <div className="relative z-10 w-full h-full max-w-[1920px] max-h-[1080px] flex items-center justify-center aspect-video">
        <AnimatePresence mode="wait">
          {currentScene === 0 && <SceneTitle key="scene-0" />}
          {currentScene === 1 && <SceneDistricts key="scene-1" />}
          {currentScene === 2 && <SceneCitizens key="scene-2" />}
          {currentScene === 3 && <SceneEconomy key="scene-3" />}
          {currentScene === 4 && <SceneFactions key="scene-4" />}
          {currentScene === 5 && <SceneControl key="scene-5" />}
          {currentScene === 6 && <SceneEnd key="scene-6" />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- SCENES ---

function SceneTitle() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center text-center w-full"
    >
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mb-8 overflow-hidden text-sm uppercase tracking-[0.5em] text-[#00FF41]/70"
      >
        Initializing Megacity Protocol...
      </motion.div>

      <div className="relative">
        <motion.h1 
          className="text-7xl md:text-9xl font-mono font-bold tracking-tighter text-glow"
          initial={{ clipPath: "inset(0 100% 0 0)" }}
          animate={{ clipPath: "inset(0 0% 0 0)" }}
          transition={{ duration: 1.2, ease: "circOut", delay: 1 }}
        >
          MEGACITY
        </motion.h1>
      </div>
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.8, duration: 0.2 }}
        className="mt-12 text-xl tracking-[0.3em] bg-[#00FF41] text-[#0A0F0A] px-4 py-1"
      >
        SYSTEM ONLINE
      </motion.div>
    </motion.div>
  );
}

function SceneDistricts() {
  const grid = Array.from({ length: 18 * 15 });
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      className="flex w-full h-full p-20 gap-12 items-center"
    >
      <div className="w-1/3 flex flex-col justify-center">
        <motion.h2 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="text-6xl font-mono font-bold text-glow mb-4"
        >
          270 DISTRICTS
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-xl uppercase tracking-widest opacity-80"
        >
          Unified Terrain Heatmap<br/>Concentric Zones
        </motion.p>
        <motion.div 
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="h-px bg-[#00FF41] w-full my-8 origin-left"
        />
        <motion.ul className="space-y-4 font-mono text-lg">
          {["ADMIN HQ [CORE]", "RESEARCH RINGS", "COMMERCIAL ZONES", "SECURITY SECTORS", "WASTELAND EDGES"].map((text, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.2 + (i * 0.1) }}
              className="flex items-center gap-4"
            >
              <span className="w-2 h-2 bg-[#00FF41] inline-block" /> {text}
            </motion.li>
          ))}
        </motion.ul>
      </div>

      <div className="w-2/3 h-full flex items-center justify-center">
        <div className="grid grid-cols-18 grid-rows-15 gap-1 w-full max-w-4xl aspect-[18/15] p-4 border border-[#00FF41]/30 box-glow">
          {grid.map((_, i) => {
            const x = i % 18;
            const y = Math.floor(i / 18);
            const distToCenter = Math.sqrt(Math.pow(x - 9, 2) + Math.pow(y - 7.5, 2));
            
            let colorClass = "bg-[#00FF41]/10";
            if (distToCenter < 2) colorClass = "bg-[#00FF41]";
            else if (distToCenter < 4) colorClass = "bg-[#00FF41]/80";
            else if (distToCenter < 7) colorClass = "bg-[#00FF41]/50";
            else if (distToCenter < 9) colorClass = "bg-[#00FF41]/30";

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ 
                  delay: 0.5 + (distToCenter * 0.05),
                  duration: 0.3
                }}
                className={`w-full h-full ${colorClass}`}
              />
            )
          })}
        </div>
      </div>
    </motion.div>
  );
}

function SceneCitizens() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number;
    const duration = 2000;
    const target = 980432;

    const animateCount = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(easeProgress * target));

      if (progress < 1) {
        requestAnimationFrame(animateCount);
      }
    };

    const timer = setTimeout(() => {
      requestAnimationFrame(animateCount);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 1.2, opacity: 0, filter: "blur(10px)" }}
      transition={{ duration: 0.8 }}
      className="flex flex-col items-center justify-center w-full h-full"
    >
      <div className="text-center mb-16">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-2xl uppercase tracking-[0.5em] mb-4 text-[#00FF41]/70"
        >
          Population Counter
        </motion.div>
        <div className="text-8xl md:text-[10rem] font-mono font-bold text-glow tracking-tighter">
          {count.toLocaleString()}
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
          className="text-4xl font-mono mt-4 text-[#00FF41]"
        >
          CITIZENS
        </motion.div>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-3 gap-8">
        {[
          { label: "UNREST", val: 68 },
          { label: "LOYALTY", val: 32 },
          { label: "EMPLOYMENT", val: 89 }
        ].map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5 + (i * 0.2) }}
            className="border border-[#00FF41]/40 p-6 box-glow bg-[#0A0F0A]/80 backdrop-blur-sm"
          >
            <div className="text-xl mb-4 font-mono">{stat.label}</div>
            <div className="h-4 w-full bg-[#0A0F0A] border border-[#00FF41]/50 relative overflow-hidden">
              <motion.div 
                initial={{ width: "0%" }}
                animate={{ width: `${stat.val}%` }}
                transition={{ delay: 2 + (i * 0.2), duration: 1, ease: "easeOut" }}
                className="absolute top-0 left-0 h-full bg-[#00FF41]"
              />
            </div>
            <div className="mt-2 text-right font-mono text-2xl">{stat.val}%</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function SceneEconomy() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.5 }}
      className="w-full h-full flex flex-col p-20"
    >
      <motion.h2 
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="text-5xl md:text-7xl font-mono font-bold text-glow mb-2"
      >
        COMMAND ECONOMY
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-2xl tracking-widest uppercase text-[#00FF41]/80 mb-12"
      >
        764 Commodities • Complex Supply Chains • 372 Structures
      </motion.p>

      <div className="flex-1 grid grid-cols-2 gap-12">
        {/* P&L Table */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="border border-[#00FF41]/30 p-6 flex flex-col bg-[#0A0F0A]/90"
        >
          <div className="text-xl border-b border-[#00FF41]/30 pb-2 mb-4 font-mono">P&L LEDGER // CYCLE 4892</div>
          <div className="space-y-3 font-mono flex-1">
            {[
              ["SYNTH-MEAT", "+4,200", "PROFIT"],
              ["WATER", "-1,150", "DEFICIT"],
              ["ENERGY", "+8,900", "PROFIT"],
              ["NARCOTICS", "+12,400", "BLACK MKT"],
              ["WEAPONS", "-300", "STABLE"],
            ].map((row, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + (i * 0.1) }}
                className="flex justify-between border-b border-[#00FF41]/10 pb-2"
              >
                <span>{row[0]}</span>
                <span className={row[1].startsWith('-') ? 'text-red-500' : 'text-[#00FF41]'}>{row[1]}</span>
                <span className="opacity-50 text-sm">{row[2]}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Supply Chain Graph */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="border border-[#00FF41]/30 p-6 relative overflow-hidden"
        >
          <div className="absolute inset-0 grid grid-cols-4 grid-rows-3 gap-4 p-8">
            {Array.from({length: 12}).map((_, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: Math.random() > 0.5 ? 1 : 0.3 }}
                transition={{ delay: 1.5 + (i * 0.05) }}
                className="border border-[#00FF41] flex items-center justify-center text-xs font-mono"
              >
                NODE_{i}
              </motion.div>
            ))}
            
            {/* SVG Lines connecting nodes */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-[#00FF41] stroke-1 opacity-50">
              <motion.line x1="20%" y1="20%" x2="50%" y2="50%" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 2, duration: 1 }} />
              <motion.line x1="50%" y1="50%" x2="80%" y2="80%" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 2.2, duration: 1 }} />
              <motion.line x1="80%" y1="20%" x2="50%" y2="50%" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 2.4, duration: 1 }} />
            </svg>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function SceneFactions() {
  const factions = [
    { name: "MEGA-CORP SYNDICATE", influence: 85 },
    { name: "REBEL UNDERGROUND", influence: 42 },
    { name: "CYBER-CHURCH", influence: 67 },
    { name: "THE MILITARY TRIBUNAL", influence: 93 },
    { name: "WASTELAND NOMADS", influence: 21 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, rotateY: 90 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={{ opacity: 0, rotateY: -90 }}
      transition={{ duration: 0.8, ease: "circOut" }}
      className="w-full h-full flex flex-col items-center justify-center p-20"
      style={{ perspective: "1000px" }}
    >
      <motion.h2 
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-6xl font-mono font-bold text-glow mb-16"
      >
        5 RIVAL FACTIONS
      </motion.h2>

      <div className="w-full max-w-5xl space-y-6">
        {factions.map((faction, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1 + (i * 0.15), type: "spring", stiffness: 100 }}
            className="flex items-center gap-6"
          >
            <div className="w-64 text-right font-mono text-xl">{faction.name}</div>
            <div className="flex-1 h-8 bg-[#0A0F0A] border border-[#00FF41]/40 relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${faction.influence}%` }}
                transition={{ delay: 1.5 + (i * 0.1), duration: 1, ease: "easeOut" }}
                className="h-full bg-[#00FF41]"
              />
              <div className="absolute inset-0 flex items-center px-4 mix-blend-difference text-white font-mono z-10">
                INFLUENCE: {faction.influence}%
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function SceneControl() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 1 }}
      className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden"
    >
      {/* Background pulsing circle */}
      <motion.div
        animate={{ scale: [1, 1.5, 1], opacity: [0.1, 0.3, 0.1] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="absolute w-[800px] h-[800px] border border-[#00FF41] rounded-full z-0"
      />

      <div className="z-10 text-center">
        <motion.h2 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-7xl md:text-9xl font-mono font-bold text-glow mb-8"
        >
          TOTAL CONTROL
        </motion.h2>

        <div className="flex justify-center gap-6 text-xl font-mono mt-12 flex-wrap max-w-4xl mx-auto">
          {[
            "WELFARE RATIONING",
            "PROPAGANDA",
            "CRIME MANAGEMENT",
            "RESEARCH TECH TREE",
            "OFFLINE IDLE PROGRESSION"
          ].map((text, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 + (i * 0.2) }}
              className="px-6 py-3 border border-[#00FF41] box-glow bg-[#0A0F0A]/80 backdrop-blur-sm"
            >
              {text}
            </motion.div>
          ))}
        </div>
        
        {/* Animated sliders */}
        <div className="mt-20 max-w-2xl mx-auto space-y-8">
          {[
            { label: "RATION LEVEL", val: 20 },
            { label: "CENSORSHIP", val: 95 },
            { label: "POLICE FORCE", val: 80 }
          ].map((slider, i) => (
             <motion.div 
               key={i}
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: 2.5 + (i * 0.2) }}
               className="flex items-center gap-4 font-mono"
             >
               <span className="w-40 text-left">{slider.label}</span>
               <div className="flex-1 h-2 bg-[#00FF41]/20">
                 <motion.div 
                   initial={{ width: '50%' }}
                   animate={{ width: `${slider.val}%` }}
                   transition={{ delay: 3, duration: 1 }}
                   className="h-full bg-[#00FF41] shadow-[0_0_10px_#00FF41]"
                 />
               </div>
             </motion.div>
          ))}
        </div>

      </div>
    </motion.div>
  );
}

function SceneEnd() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
      className="w-full h-full flex flex-col items-center justify-center bg-[#00FF41] text-[#0A0F0A]"
    >
      <motion.div
        initial={{ scale: 2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.5 }}
        className="text-center"
      >
        <h1 className="text-6xl md:text-8xl font-mono font-black tracking-tighter mb-4">
          MEGACITY
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.5 }}
        className="mt-20 px-12 py-6 border-4 border-[#0A0F0A] text-4xl font-bold font-mono tracking-widest hover:bg-[#0A0F0A] hover:text-[#00FF41] transition-colors duration-300"
      >
        EARLY ACCESS — PLAY NOW
      </motion.div>
    </motion.div>
  );
}
