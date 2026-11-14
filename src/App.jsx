import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import {
  Shield,
  Sparkles,
  Users,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Crown,
  Shuffle,
  Moon,
  Sun,
  Timer,
  Check,
  Copy,
  QrCode,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Minus,
  ThumbsUp,
  ThumbsDown,
  Award,
  Smartphone,
  Wifi,
  ChevronRight,
  Trash2,
  UserPlus,
  RefreshCw,
  Edit3,
  KeyRound,
  X,
  Gavel,
} from 'lucide-react';

// ============================================================================
// FIREBASE INITIALIZATION (READS VERCEL ENV VARIABLE + LOCAL FALLBACK)
// ============================================================================
let db = null;
let auth = null;
let appId = 'parlor-chit-game';

try {
  const rawConfig =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_FIREBASE_CONFIG
      ? import.meta.env.VITE_FIREBASE_CONFIG
      : typeof __firebase_config !== 'undefined' && __firebase_config
      ? __firebase_config
      : null;

  if (rawConfig) {
    const firebaseConfig =
      typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    if (firebaseConfig && firebaseConfig.apiKey) {
      const app =
        getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      auth = getAuth(app);
      db = getFirestore(app);
    }
  }
  if (typeof __app_id !== 'undefined' && __app_id) {
    appId = __app_id;
  }
} catch (err) {
  // Fallback gracefully to local mode if Firebase config is unavailable
  console.warn('Running in local parlor state mode:', err);
}

// ============================================================================
// EDITORIAL ROLE DEFINITIONS & PRESETS
// ============================================================================
const ROLES = {
  MURDERER: {
    id: 'MURDERER',
    title: 'The Murderer',
    shortName: 'Murderer',
    roman: 'I',
    alignment: 'Syndicate of Shadows',
    team: 'MURDERER',
    motto: 'Deception is sharpest in candlelight.',
    ability:
      'Awaken each night with your fellow conspirators to silently select one guest for elimination.',
    accentColor: '#7A1C1C',
    badgeBg: '#F9ECEC',
    badgeText: '#7A1C1C',
  },
  DOCTOR: {
    id: 'DOCTOR',
    title: 'The Physician',
    shortName: 'Doctor',
    roman: 'II',
    alignment: 'Order of the Parlor',
    team: 'VILLAGER',
    motto: 'A steady hand against the unseen blade.',
    ability:
      'Awaken each night to place one guest (or yourself) under medical protection against murder.',
    accentColor: '#1C4538',
    badgeBg: '#EBF3F0',
    badgeText: '#1C4538',
  },
  DETECTIVE: {
    id: 'DETECTIVE',
    title: 'The Inspector',
    shortName: 'Detective',
    roman: 'III',
    alignment: 'Order of the Parlor',
    team: 'VILLAGER',
    motto: 'Every alibi leaves a faint crease in the paper.',
    ability:
      'Awaken each night to investigate one guest; the Moderator will silently signal whether they are a Murderer.',
    accentColor: '#8B6229',
    badgeBg: '#F7EFE2',
    badgeText: '#8B6229',
  },
  POLICE: {
    id: 'POLICE',
    title: 'The Constable',
    shortName: 'Police',
    roman: 'IV',
    alignment: 'Order of the Parlor',
    team: 'VILLAGER',
    motto: 'By warrant of the house, stand forth.',
    ability:
      'Once per game during Daylight debate, you may issue a Public Warrant to immediately detain a suspect.',
    accentColor: '#23425C',
    badgeBg: '#EBF1F6',
    badgeText: '#23425C',
  },
  VILLAGER: {
    id: 'VILLAGER',
    title: 'The Esteemed Guest',
    shortName: 'Villager',
    roman: 'V',
    alignment: 'Order of the Parlor',
    team: 'VILLAGER',
    motto: 'Truth is uncovered in the quiet between accusations.',
    ability:
      'Observe body language, debate during Daylight, and cast your ballot to banish the Murderers.',
    accentColor: '#4A5D56',
    badgeBg: '#F0EFEA',
    badgeText: '#2D3B36',
  },
};

const SAMPLE_PARTIES = {
  classic7: [
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
    'P6',
    'P7',
  ].map((n) => n.charAt(0).toUpperCase() + n.slice(1)),
  salon10: [
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
    'P6',
    'P7',
    'P8',
    'P9',
    'P10',
  ],
};

// Smart role preset calculator based on active non-God player count
function getSmartRolePreset(activeCount, includePolice = false) {
  const total = Math.max(4, activeCount);
  const murderers = total >= 11 ? 3 : total >= 7 ? 2 : 1;
  const doctor = 1;
  const detective = 1;
  const police = includePolice && total >= 6 ? 1 : 0;
  const villagers = Math.max(
    1,
    total - murderers - doctor - detective - police
  );
  return {
    MURDERER: murderers,
    DOCTOR: doctor,
    DETECTIVE: detective,
    POLICE: police,
    VILLAGER: villagers,
  };
}

// Generate 5-character room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate unique 4-character cipher code for each player
function generatePlayerCode(existingSet) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (existingSet.has(code));
  existingSet.add(code);
  return code;
}

// Single source of truth for the Firestore room document reference
const getRoomRef = (code) =>
  db
    ? doc(db, 'artifacts', appId, 'public', 'data', 'parlor_rooms', code)
    : null;

const SESSION_KEY = 'parlor_chit_session';

// ============================================================================
// REUSABLE EDITORIAL DESIGN SYSTEM COMPONENTS
// ============================================================================
const Eyebrow = ({ children, className = '' }) => (
  <div className={`inline-flex items-center gap-3 ${className}`}>
    <span className="w-6 h-[1px] bg-[#9E7642] shrink-0" />
    <span className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#9E7642]">
      {children}
    </span>
  </div>
);

const PrimaryButton = ({
  children,
  onClick,
  disabled = false,
  type = 'button',
  className = '',
  showArrow = true,
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`rounded-full bg-[#1C4538] hover:bg-[#14362B] active:scale-[0.99] text-[#FAF7F0] px-6 py-3.5 text-sm font-medium transition-all duration-200 inline-flex items-center justify-center gap-2.5 shadow-sm disabled:opacity-45 disabled:pointer-events-none cursor-pointer ${className}`}
  >
    <span>{children}</span>
    {showArrow && <span className="text-base leading-none">→</span>}
  </button>
);

const SecondaryButton = ({
  children,
  onClick,
  disabled = false,
  type = 'button',
  className = '',
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`rounded-full bg-[#FFFDF9]/90 hover:bg-[#F3EDE0] active:scale-[0.99] text-[#14362B] border border-[#D8D1C5] px-5 py-3 text-sm font-medium transition-all duration-200 inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:pointer-events-none cursor-pointer ${className}`}
  >
    {children}
  </button>
);

// Custom SVG Editorial Emblem for each Role
const RoleEmblem = ({ roleId, size = 'md' }) => {
  const dimensions =
    size === 'lg' ? 'w-20 h-20' : size === 'sm' ? 'w-10 h-10' : 'w-14 h-14';

  return (
    <div
      className={`${dimensions} rounded-full border border-[#C8B796] bg-[#FAF5E8] flex items-center justify-center shadow-inner relative`}
    >
      <div className="absolute inset-1 rounded-full border border-dashed border-[#C8B796]/70" />
      {roleId === 'MURDERER' && (
        <svg
          viewBox="0 0 24 24"
          className="w-1/2 h-1/2 text-[#7A1C1C]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M14.5 3.5L20.5 9.5L7.5 22.5L1.5 22.5L1.5 16.5L14.5 3.5Z" />
          <path d="M11 7L17 13" />
        </svg>
      )}
      {roleId === 'DOCTOR' && (
        <svg
          viewBox="0 0 24 24"
          className="w-1/2 h-1/2 text-[#1C4538]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 4V20M4 12H20" />
          <circle cx="12" cy="12" r="9" strokeWidth="1.2" />
        </svg>
      )}
      {roleId === 'DETECTIVE' && (
        <svg
          viewBox="0 0 24 24"
          className="w-1/2 h-1/2 text-[#8B6229]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5L21 21" />
        </svg>
      )}
      {roleId === 'POLICE' && (
        <svg
          viewBox="0 0 24 24"
          className="w-1/2 h-1/2 text-[#23425C]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 2L4 5.5V11.5C4 16.8 7.4 21.6 12 23C16.6 21.6 20 16.8 20 11.5V5.5L12 2Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )}
      {(!roleId || roleId === 'VILLAGER') && (
        <svg
          viewBox="0 0 24 24"
          className="w-1/2 h-1/2 text-[#4A5D56]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M12 3L14.8 8.8L21 9.7L16.5 14.1L17.6 20.3L12 17.3L6.4 20.3L7.5 14.1L3 9.7L9.2 8.8L12 3Z" />
        </svg>
      )}
    </div>
  );
};

// ============================================================================
// REALISTIC 3D 4-FOLD AGED PARCHMENT ROLE CHIT COMPONENT
// ============================================================================
const InteractiveChitCard = ({ player, onClose }) => {
  // foldStage: 0 = Completely Folded Packet, 1 = Fold 1/4 Open, 2 = Fold 2/4 Open, 3 = Fold 3/4 Open, 4 = Fully Unfolded
  const [foldStage, setFoldStage] = useState(0);
  const [isUnfoldingActive, setIsUnfoldingActive] = useState(false);
  const stageTimersRef = useRef([]);

  const role = ROLES[player?.role] || ROLES.VILLAGER;

  const clearStageTimers = () => {
    stageTimersRef.current.forEach((t) => clearTimeout(t));
    stageTimersRef.current = [];
  };

  // Trigger sequential 4-fold opening animation when player holds or activates unfold
  const startSequentialUnfold = () => {
    clearStageTimers();
    setIsUnfoldingActive(true);

    // Step through folds 1 -> 2 -> 3 -> 4 sequentially
    const delays = [
      { stage: 1, ms: 80 },
      { stage: 2, ms: 340 },
      { stage: 3, ms: 620 },
      { stage: 4, ms: 900 },
    ];

    delays.forEach(({ stage, ms }) => {
      const timer = setTimeout(() => {
        setFoldStage(stage);
      }, ms);
      stageTimersRef.current.push(timer);
    });
  };

  // Fold back sequentially on release
  const stopAndRefold = () => {
    clearStageTimers();
    setIsUnfoldingActive(false);

    const closeDelays = [
      { stage: 3, ms: 60 },
      { stage: 2, ms: 180 },
      { stage: 1, ms: 300 },
      { stage: 0, ms: 420 },
    ];

    closeDelays.forEach(({ stage, ms }) => {
      const timer = setTimeout(() => {
        setFoldStage((prev) => (prev > stage ? stage : prev));
      }, ms);
      stageTimersRef.current.push(timer);
    });
  };

  // Automatically open Fold 1 slightly when unlocked so player feels the 3D paper response immediately
  useEffect(() => {
    const introTimer = setTimeout(() => {
      setFoldStage(1);
    }, 220);
    return () => clearTimeout(introTimer);
  }, [player?.id]);

  useEffect(() => {
    const handleKeyUp = (e) => {
      if (e.code === 'Space') stopAndRefold();
    };
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) startSequentialUnfold();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearStageTimers();
    };
  }, []);

  if (!player) return null;

  const foldLabels = [
    'Sealed 4-Fold Parchment Chit',
    'Fold 1 of 4 Unfolded — Hold to Open Remaining Folds',
    'Unfolding Crease 2 of 4...',
    'Unfolding Crease 3 of 4...',
    'All 4 Folds Open — Secret Role Revealed',
  ];

  return (
    <div className="w-full max-w-lg mx-auto select-none">
      {/* 4-Fold Progress Indicator Header */}
      <div className="mb-4 flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[#9E7642]">
            {foldLabels[foldStage]}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`h-2 rounded-full transition-all duration-300 ${
                foldStage >= step
                  ? 'w-6 bg-[#9E7642]'
                  : 'w-2 bg-[#D8D1C5]/60'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 3D Perspective Stage */}
      <div
        className="relative w-full"
        style={{
          perspective: '1500px',
        }}
      >
        <div
          className={`relative rounded-2xl transition-all duration-500 overflow-hidden border-2 ${
            foldStage === 4
              ? 'border-[#9E7642] shadow-[0_28px_60px_-15px_rgba(20,54,43,0.45)] scale-[1.01]'
              : 'border-[#C8B796] shadow-[0_16px_36px_-10px_rgba(20,54,43,0.28)]'
          }`}
          style={{
            backgroundColor: '#F4ECD8',
            backgroundImage: `
              radial-gradient(rgba(139, 109, 67, 0.14) 1px, transparent 0),
              linear-gradient(135deg, rgba(226, 211, 181, 0.65) 0%, rgba(244, 236, 216, 0.92) 48%, rgba(219, 201, 166, 0.78) 100%)
            `,
            backgroundSize: '16px 16px, 100% 100%',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Vintage Burnt / Aged Inner Edge Vignette */}
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{
              boxShadow:
                'inset 0 0 42px rgba(122, 92, 48, 0.28), inset 0 0 8px rgba(89, 63, 28, 0.25)',
            }}
          />

          {/* Physical 4-Fold Crease Lines across the Old Paper */}
          <div
            className="pointer-events-none absolute inset-x-0 top-1/4 h-[2px] z-20 transition-opacity duration-500"
            style={{
              background:
                'linear-gradient(to bottom, rgba(92,68,35,0.25), rgba(255,252,242,0.65))',
              opacity: foldStage === 4 ? 0.45 : 0.85,
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-2/4 h-[2px] z-20 transition-opacity duration-500"
            style={{
              background:
                'linear-gradient(to bottom, rgba(92,68,35,0.3), rgba(255,252,242,0.7))',
              opacity: foldStage === 4 ? 0.5 : 0.9,
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-3/4 h-[2px] z-20 transition-opacity duration-500"
            style={{
              background:
                'linear-gradient(to bottom, rgba(92,68,35,0.25), rgba(255,252,242,0.65))',
              opacity: foldStage === 4 ? 0.45 : 0.85,
            }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 w-[2px] z-20 transition-opacity duration-500"
            style={{
              background:
                'linear-gradient(to right, rgba(92,68,35,0.22), rgba(255,252,242,0.55))',
              opacity: foldStage === 4 ? 0.35 : 0.8,
            }}
          />

          {/* Top Aged Header Strip */}
          <div className="relative z-10 px-6 pt-5 pb-4 border-b border-[#D5C5A3] bg-[#EAE0C8]/75 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-[0.22em] text-[#7D5B2E] font-bold block">
                QUAD-FOLDED PARLOR PARCHMENT
              </span>
              <h4 className="font-serif text-xl text-[#14362B] mt-0.5">
                {player.name}
              </h4>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[#5C4930] block">
                CIPHER SEAL
              </span>
              <span className="font-mono text-sm font-bold text-[#14362B] bg-[#F8F3E6] px-2.5 py-0.5 rounded border border-[#C8B796]">
                {player.code}
              </span>
            </div>
          </div>

          {/* 3D Accordion 4-Fold Container */}
          <div className="relative min-h-[360px] flex flex-col justify-between p-6 sm:p-8 overflow-hidden">
            {/* Corner Vintage Registration Marks */}
            <div className="w-3.5 h-3.5 border-t-2 border-l-2 border-[#8C6D3F]/60 absolute top-4 left-4 z-10" />
            <div className="w-3.5 h-3.5 border-t-2 border-r-2 border-[#8C6D3F]/60 absolute top-4 right-4 z-10" />
            <div className="w-3.5 h-3.5 border-b-2 border-l-2 border-[#8C6D3F]/60 absolute bottom-4 left-4 z-10" />
            <div className="w-3.5 h-3.5 border-b-2 border-r-2 border-[#8C6D3F]/60 absolute bottom-4 right-4 z-10" />

            {/* INTERIOR ENGRAVED ROLE CONTENT (Reveals gradually as folds 1-4 open) */}
            <div
              className="my-auto flex flex-col items-center text-center transition-all duration-500"
              style={{
                opacity:
                  foldStage === 0
                    ? 0
                    : foldStage === 1
                    ? 0.12
                    : foldStage === 2
                    ? 0.38
                    : foldStage === 3
                    ? 0.72
                    : 1,
                transform: `scale(${0.92 + foldStage * 0.02})`,
                filter:
                  foldStage < 4 ? `blur(${(4 - foldStage) * 2.5}px)` : 'none',
              }}
            >
              <div className="mb-3">
                <RoleEmblem roleId={role.id} size="lg" />
              </div>

              <span
                className="text-[11px] uppercase tracking-[0.2em] font-semibold px-3.5 py-1 rounded-full border mb-3"
                style={{
                  backgroundColor: role.badgeBg,
                  color: role.badgeText,
                  borderColor: `${role.accentColor}40`,
                }}
              >
                {role.alignment} • Folio {role.roman}
              </span>

              <h2
                className="font-serif text-3xl sm:text-4xl mb-2 tracking-tight font-semibold"
                style={{ color: role.accentColor }}
              >
                {role.title}
              </h2>

              <p className="font-serif italic text-[#8B6229] text-base mb-4">
                “{role.motto}”
              </p>

              <div className="w-16 h-[1px] bg-[#C8B796] my-1.5" />

              <p className="text-sm text-[#3E3222] max-w-xs leading-relaxed mt-2 font-medium">
                {role.ability}
              </p>

              {player.status !== 'ALIVE' && (
                <div className="mt-4 px-3 py-1 rounded bg-[#8B2626]/15 text-[#8B2626] text-xs font-semibold uppercase tracking-widest border border-[#8B2626]/30">
                  Current Status: {player.status}
                </div>
              )}
            </div>

            {/* 4 PHYSICAL PAPER FOLD FLAPS OVERLAYING THE CHIT */}
            {foldStage < 4 && (
              <div
                className="absolute inset-0 z-30 flex flex-col justify-between pointer-events-none"
                style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
              >
                {/* FOLD 1: Top Outer Parchment Flap (Unfolds at Stage 1) */}
                <div
                  className="w-full h-1/4 border-b border-[#C5B28E] flex items-center justify-between px-6 transition-all duration-300 origin-top"
                  style={{
                    backgroundColor: '#E8DEC5',
                    backgroundImage:
                      'linear-gradient(180deg, #EFE6D0 0%, #DFD1B2 100%)',
                    transform:
                      foldStage >= 1
                        ? 'rotateX(-110deg) translateY(-10px)'
                        : 'rotateX(0deg)',
                    opacity: foldStage >= 1 ? 0 : 1,
                    boxShadow: '0 8px 18px rgba(62, 45, 22, 0.18)',
                  }}
                >
                  <span className="font-serif italic text-xs text-[#6B5331]">
                    Fold I • Outer Parchment Margin
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C6D3F]">
                    Crease 01
                  </span>
                </div>

                {/* FOLD 2: Upper-Middle Parchment Flap with Wax Stamp (Unfolds at Stage 2) */}
                <div
                  className="w-full h-1/4 border-b border-[#C5B28E] flex items-center justify-center px-6 transition-all duration-300 origin-top"
                  style={{
                    backgroundColor: '#EFE6CE',
                    backgroundImage:
                      'linear-gradient(180deg, #F3EAD6 0%, #E3D5B7 100%)',
                    transform:
                      foldStage >= 2
                        ? 'rotateX(-105deg) translateY(-8px)'
                        : 'rotateX(0deg)',
                    opacity: foldStage >= 2 ? 0 : 1,
                    boxShadow: '0 10px 22px rgba(62, 45, 22, 0.22)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-[#7A1C1C] border-2 border-[#591111] shadow-md flex items-center justify-center text-[#F4ECD8]">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[#7A1C1C] font-bold block">
                        WAX SEAL INTACT
                      </span>
                      <span className="font-serif text-sm text-[#2E2418]">
                        Fold II • Confidential Assignment
                      </span>
                    </div>
                  </div>
                </div>

                {/* FOLD 3: Lower-Middle Horizontal Fold (Unfolds at Stage 3) */}
                <div
                  className="w-full h-1/4 border-b border-[#C5B28E] flex items-center justify-between px-6 transition-all duration-300 origin-bottom"
                  style={{
                    backgroundColor: '#E9DFC7',
                    backgroundImage:
                      'linear-gradient(0deg, #EFE6D0 0%, #DDD0B1 100%)',
                    transform:
                      foldStage >= 3
                        ? 'rotateX(105deg) translateY(8px)'
                        : 'rotateX(0deg)',
                    opacity: foldStage >= 3 ? 0 : 1,
                    boxShadow: '0 -6px 16px rgba(62, 45, 22, 0.16)',
                  }}
                >
                  <span className="font-serif italic text-xs text-[#6B5331]">
                    Fold III • Inner Parchment Leaf
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C6D3F]">
                    {foldStage === 2 ? 'Opening Fold III...' : 'Crease 03'}
                  </span>
                </div>

                {/* FOLD 4: Final Innermost Parchment Flap (Unfolds at Stage 4) */}
                <div
                  className="w-full h-1/4 flex items-center justify-between px-6 transition-all duration-300 origin-bottom"
                  style={{
                    backgroundColor: '#E5D9BD',
                    backgroundImage:
                      'linear-gradient(0deg, #DFD1B2 0%, #EFE6D0 100%)',
                    transform:
                      foldStage >= 4
                        ? 'rotateX(110deg) translateY(10px)'
                        : 'rotateX(0deg)',
                    opacity: foldStage >= 4 ? 0 : 1,
                  }}
                >
                  <span className="font-serif italic text-xs text-[#6B5331]">
                    Fold IV • Role Engraving
                  </span>
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-[#7D5B2E]">
                    Hold button below to unfold 1→4
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Hold-to-Unfold Footer */}
          <div className="relative z-30 p-5 bg-[#EAE0C8] border-t border-[#D5C5A3] flex flex-col gap-3">
            <button
              type="button"
              onMouseDown={startSequentialUnfold}
              onMouseUp={stopAndRefold}
              onMouseLeave={stopAndRefold}
              onTouchStart={startSequentialUnfold}
              onTouchEnd={stopAndRefold}
              onTouchCancel={stopAndRefold}
              onContextMenu={(e) => e.preventDefault()}
              className={`w-full py-4 px-6 rounded-full font-medium text-sm tracking-wider uppercase transition-all duration-200 flex items-center justify-center gap-3 select-none cursor-pointer ${
                isUnfoldingActive || foldStage === 4
                  ? 'bg-[#8B6229] text-[#FFFDF9] shadow-inner scale-[0.99]'
                  : 'bg-[#1C4538] text-[#FAF7F0] hover:bg-[#14362B] shadow-md'
              }`}
            >
              {foldStage === 4 ? (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>All 4 Folds Open — Release to Refold Chit</span>
                </>
              ) : isUnfoldingActive ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>
                    Unfolding Paper ({foldStage} / 4 Folds)... Keep Holding
                  </span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  <span>Hold to Unfold All 4 Creases</span>
                </>
              )}
            </button>

            {onClose && (
              <SecondaryButton
                onClick={onClose}
                className="w-full py-2.5 text-xs bg-[#F4ECD8] border-[#C8B796]"
              >
                Refold & Lock Chit Before Passing Device
              </SecondaryButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================
export default function App() {
  // Navigation Screen: 'LANDING' | 'LOBBY' | 'ROLE_SETUP' | 'GAME_TABLE'
  const [screen, setScreen] = useState('LANDING');
  const [gameMode, setGameMode] = useState('OFFLINE'); // 'OFFLINE' | 'ONLINE'
  const [roomCode, setRoomCode] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinCodeError, setJoinCodeError] = useState('');
  const [user, setUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('local'); // 'local' | 'synced'
  const [toastMessage, setToastMessage] = useState('');

  // Lobby Input & God Shuffle Animation States
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isShufflingGod, setIsShufflingGod] = useState(false);
  const [shuffleHighlightIndex, setShuffleHighlightIndex] = useState(null);
  const [hideGodSpoilers, setHideGodSpoilers] = useState(false);
  const [showSpoilerUnlockPrompt, setShowSpoilerUnlockPrompt] = useState(false);
  const [spoilerUnlockPinInput, setSpoilerUnlockPinInput] = useState('');
  const [spoilerUnlockError, setSpoilerUnlockError] = useState('');

  // Perspective Switcher & God Console Security Passcode State
  const [activePerspective, setActivePerspective] = useState('GOD'); // 'GOD' | 'PLAYER_DEVICE'
  const [isGodAuthenticated, setIsGodAuthenticated] = useState(true);
  const [godPinAttempt, setGodPinAttempt] = useState('');
  const [godPinError, setGodPinError] = useState('');
  const [isEditingGodPasscode, setIsEditingGodPasscode] = useState(false);
  const [newGodPasscodeInput, setNewGodPasscodeInput] = useState('');

  // Editable Player Code State (for God in Cipher Assignment & Master Ledger)
  const [editingPlayerId, setEditingPlayerId] = useState(null);
  const [editingPlayerCodeInput, setEditingPlayerCodeInput] = useState('');

  // Player Chit Kiosk Unlock States
  const [unlockedPlayerId, setUnlockedPlayerId] = useState(null);
  const [chitPinInput, setChitPinInput] = useState('');
  const [chitPinError, setChitPinError] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);

  // Day Discussion Countdown Timer States
  const [timerSeconds, setTimerSeconds] = useState(180);
  const [timerPresetMinutes, setTimerPresetMinutes] = useState(3);
  const [timerRunning, setTimerRunning] = useState(false);

  // Core Game State (Synced with Firestore in ONLINE mode)
  const [gameState, setGameState] = useState({
    roomCode: '',
    mode: 'OFFLINE',
    phase: 'LOBBY', // 'LOBBY' | 'ROLE_SETUP' | 'CHIT_DISTRIBUTION' | 'NIGHT' | 'DAY' | 'GAME_OVER'
    roundNumber: 1,
    godPasscode: '0000',
    players: SAMPLE_PARTIES.classic7.map((name, idx) => ({
      id: `p_${idx + 1}`,
      name,
      code: '',
      role: 'VILLAGER',
      isGod: idx === 0,
      status: 'ALIVE', // 'ALIVE' | 'ELIMINATED' | 'ARRESTED'
      eliminatedRound: null,
      eliminatedReason: '',
    })),
    godPlayerId: 'p_1',
    includePoliceRole: false,
    roleCounts: getSmartRolePreset(6, false),
    rules: {
      preventConsecutiveDoctorSelfSave: true,
    },
    nightState: {
      step: 1, // 1: Murderer, 2: Doctor, 3: Detective, 4: Dawn Summary
      murdererTargetId: null,
      doctorSaveId: null,
      lastDoctorSaveId: null,
      detectiveCheckId: null,
    },
    dayState: {
      lastNightHeadline: '',
      lastNightEliminatedId: null,
      votesByVoter: {}, // voterId -> suspectId (Online mode)
      manualVoteTallies: {}, // suspectId -> number (Offline / God mode)
      policeArrestUsed: false,
      policeArrestedId: null,
      eliminatedTodayId: null,
    },
    winner: null, // 'VILLAGER' | 'MURDERER' | null
    winReason: '',
    chronicle: [
      {
        id: 'init_1',
        title: 'The Parlor Gathers',
        detail: 'Guests have assembled in the drawing room.',
      },
    ],
  });

  // Always-current copy of game state (avoids stale closures & side effects inside setState)
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Host = the device that created the room (always true offline)
  const isHost =
    gameMode !== 'ONLINE' ||
    (!!user && !!gameState.hostUid && gameState.hostUid === user.uid);

  // Toast Notification helper
  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? '' : prev));
    }, 3200);
  };

  // Copy helper
  const copyToClipboard = (text, label = 'Copied to clipboard') => {
    try {
      navigator.clipboard.writeText(text);
      triggerToast(label);
    } catch {
      triggerToast(label);
    }
  };

  // ============================================================================
  // 1. FIREBASE AUTH & REAL-TIME ROOM SYNC
  // ============================================================================
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && roomParam.trim().length === 5) {
      setJoinCodeInput(roomParam.trim().toUpperCase());
    }
  }, []);
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== 'undefined' &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.warn('Auth fallback:', e);
      }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (gameMode !== 'ONLINE' || !roomCode || !db || !user) {
      setSyncStatus('local');
      return;
    }

    const roomDocRef = doc(
      db,
      'artifacts',
      appId,
      'public',
      'data',
      'parlor_rooms',
      roomCode
    );

    const unsub = onSnapshot(
      roomDocRef,
      (snapshot) => {
        // Ignore echoes of our own not-yet-confirmed writes (prevents flicker/rollback)
        if (snapshot.metadata.hasPendingWrites) return;
        if (snapshot.exists()) {
          const remoteData = snapshot.data();
          if (remoteData && remoteData.players) {
            gameStateRef.current = remoteData;
            setGameState(remoteData);
            setSyncStatus('synced');
          }
        } else {
          setSyncStatus('local');
          triggerToast('This room no longer exists.');
        }
      },
      (err) => {
        console.warn('Firestore snapshot listener fallback:', err);
        setSyncStatus('local');
      }
    );

    return () => unsub();
  }, [gameMode, roomCode, user]);

  // Unified state updater that persists to Firestore when in ONLINE mode.
  // The write happens exactly once, outside the React updater (StrictMode-safe).
  const commitGameState = (updater) => {
    const prev = gameStateRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    gameStateRef.current = next;
    setGameState(next);
    if (gameMode === 'ONLINE' && roomCode && db && user) {
      setDoc(getRoomRef(roomCode), next).catch((e) => {
        console.warn('Sync write error:', e);
        setSyncStatus('local');
        triggerToast('Sync failed — check your connection.');
      });
    }
  };

  // Persist session so a refresh doesn't kick the player out of the room
  useEffect(() => {
    try {
      if (gameMode === 'ONLINE' && roomCode) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode }));
      }
    } catch {
      /* storage unavailable */
    }
  }, [gameMode, roomCode]);

  // Players should never keep a stale chit open once a new round resets the deck
  useEffect(() => {
    if (gameState.phase === 'LOBBY' || gameState.phase === 'ROLE_SETUP') {
      setUnlockedPlayerId(null);
    }
  }, [gameState.phase]);

  // ============================================================================
  // 2. DISCUSSION TIMER EFFECT
  // ============================================================================
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  // Determine whether the entire room is in Nocturnal Night Atmosphere
  const isNocturnalNight =
    screen === 'GAME_TABLE' && gameState.phase === 'NIGHT';

  // Derived Player Lists
  const activeNonGodPlayers = useMemo(
    () => gameState.players.filter((p) => p.id !== gameState.godPlayerId),
    [gameState.players, gameState.godPlayerId]
  );

  const livingActivePlayers = useMemo(
    () => activeNonGodPlayers.filter((p) => p.status === 'ALIVE'),
    [activeNonGodPlayers]
  );

  const godPlayer = useMemo(
    () =>
      gameState.players.find((p) => p.id === gameState.godPlayerId) ||
      gameState.players[0],
    [gameState.players, gameState.godPlayerId]
  );

  // ============================================================================
  // 3. MODE SELECTION & ROOM CREATION / JOINING
  // ============================================================================
  const startOfflineMode = () => {
    setGameMode('OFFLINE');
    setRoomCode('');
    setActivePerspective('GOD');
    setIsGodAuthenticated(true);
    setScreen('LOBBY');
  };

  const createOnlineRoom = async () => {
    if (!db || !user) {
      triggerToast('Online play is unavailable (Firebase not connected).');
      return;
    }
    try {
      // Avoid overwriting an existing room that happens to share the code
      let newCode = generateRoomCode();
      for (let i = 0; i < 8; i++) {
        const existing = await getDoc(getRoomRef(newCode));
        if (!existing.exists()) break;
        newCode = generateRoomCode();
      }

      const initialState = {
        ...gameStateRef.current,
        roomCode: newCode,
        mode: 'ONLINE',
        phase: 'LOBBY',
        hostUid: user.uid,
      };
      await setDoc(getRoomRef(newCode), initialState);

      gameStateRef.current = initialState;
      setGameState(initialState);
      setGameMode('ONLINE');
      setRoomCode(newCode);
      setActivePerspective('GOD');
      setIsGodAuthenticated(true);
      setSyncStatus('synced');
      setScreen('LOBBY');
      triggerToast(`Created live room ${newCode}`);
    } catch (e) {
      console.warn('Error creating online room:', e);
      triggerToast('Could not create the room. Please try again.');
    }
  };

  const joinRoomByCode = async (code, silent = false) => {
    if (!db || !user) {
      setJoinCodeError('Online play is unavailable. Check your connection.');
      return false;
    }
    try {
      const snap = await getDoc(getRoomRef(code));
      if (!snap.exists()) {
        if (!silent)
          setJoinCodeError(
            `Room "${code}" was not found. Check the code with your host.`
          );
        return false;
      }
      const data = snap.data();
      const amHost = !!data.hostUid && data.hostUid === user.uid;
      gameStateRef.current = data;
      setGameState(data);
      setGameMode('ONLINE');
      setRoomCode(code);
      setUnlockedPlayerId(null);
      if (amHost) {
        // Host returning after a refresh: back to the console, behind the passcode
        setActivePerspective('GOD');
        setIsGodAuthenticated(false);
        setScreen(
          data.phase === 'LOBBY'
            ? 'LOBBY'
            : data.phase === 'ROLE_SETUP'
            ? 'ROLE_SETUP'
            : 'GAME_TABLE'
        );
      } else {
        setActivePerspective('PLAYER_DEVICE');
        setIsGodAuthenticated(false);
        setScreen('GAME_TABLE');
      }
      if (!silent) triggerToast(`Joined Room ${code}`);
      return true;
    } catch (err) {
      console.warn('Join error:', err);
      if (!silent) setJoinCodeError('Unable to connect to room. Please try again.');
      return false;
    }
  };

  const handleJoinOnlineRoom = async (e) => {
    e.preventDefault();
    const cleaned = joinCodeInput.trim().toUpperCase();
    if (cleaned.length !== 5) {
      setJoinCodeError('Please enter a valid 5-character Room Code.');
      return;
    }
    setJoinCodeError('');
    await joinRoomByCode(cleaned);
  };

  // Auto-rejoin the last room after a page refresh
  const triedRejoin = useRef(false);
  useEffect(() => {
    if (triedRejoin.current || !user || !db) return;
    triedRejoin.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (saved?.roomCode) joinRoomByCode(saved.roomCode, true);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ============================================================================
  // 4. GOD CONSOLE PASSCODE VERIFICATION & CUSTOMIZATION HANDLERS
  // ============================================================================
  const handleSwitchToGodTab = () => {
    if (!isHost) {
      triggerToast('Only the room host can open the God Console.');
      return;
    }
    setActivePerspective('GOD');
    setGodPinError('');
    setGodPinAttempt('');
  };

  const handleLockGodConsoleAndSwitchToKiosk = () => {
    setIsGodAuthenticated(false);
    setGodPinAttempt('');
    setGodPinError('');
    setUnlockedPlayerId(null);
    setChitPinInput('');
    setActivePerspective('PLAYER_DEVICE');
    triggerToast('God Console locked. Safe to pass device to players.');
  };

  const handleVerifyGodPasscode = (e) => {
    if (e) e.preventDefault();
    if (!isHost) {
      setGodPinError('Only the room host can open the God Console.');
      return;
    }
    const cleaned = godPinAttempt.trim().toUpperCase();
    const expected = (gameState.godPasscode || '0000').trim().toUpperCase();
    if (cleaned === expected) {
      setIsGodAuthenticated(true);
      setGodPinAttempt('');
      setGodPinError('');
      triggerToast('Moderator Seal verified. God Console unlocked.');
    } else {
      setGodPinError('Incorrect God Passcode. Access restricted to Moderator.');
    }
  };

  const handleSaveCustomGodPasscode = (e) => {
    if (e) e.preventDefault();
    const cleaned = newGodPasscodeInput.trim().toUpperCase();
    if (cleaned.length < 3 || cleaned.length > 8) {
      triggerToast('God Passcode must be between 3 and 8 characters.');
      return;
    }
    commitGameState((prev) => ({
      ...prev,
      godPasscode: cleaned,
    }));
    setIsEditingGodPasscode(false);
    setNewGodPasscodeInput('');
    triggerToast(`God Console passcode updated to "${cleaned}".`);
  };

  // Toggle Hide Spoilers: Hides both Cipher Codes & Roles immediately; requires God Code to reveal
  const handleToggleGodSpoilers = () => {
    if (!hideGodSpoilers) {
      setHideGodSpoilers(true);
      setEditingPlayerId(null);
      setEditingPlayerCodeInput('');
      setIsEditingGodPasscode(false);
      setShowSpoilerUnlockPrompt(false);
      setSpoilerUnlockPinInput('');
      setSpoilerUnlockError('');
      triggerToast('Spoilers hidden: Cipher codes and roles are now locked.');
    } else {
      setShowSpoilerUnlockPrompt((prev) => !prev);
      setSpoilerUnlockPinInput('');
      setSpoilerUnlockError('');
    }
  };

  const handleVerifySpoilerUnlock = (e) => {
    if (e) e.preventDefault();
    const cleaned = spoilerUnlockPinInput.trim().toUpperCase();
    const expected = (gameState.godPasscode || '0000').trim().toUpperCase();
    if (cleaned === expected) {
      setHideGodSpoilers(false);
      setShowSpoilerUnlockPrompt(false);
      setSpoilerUnlockPinInput('');
      setSpoilerUnlockError('');
      triggerToast('God Code verified. Cipher codes and roles revealed.');
    } else {
      setSpoilerUnlockError(
        'Incorrect God Code. Cipher codes and roles remain hidden.'
      );
    }
  };

  // ============================================================================
  // 5. EDITABLE PLAYER CIPHER CODE HANDLERS (BY GOD)
  // ============================================================================
  const startEditingPlayerCode = (player) => {
    setEditingPlayerId(player.id);
    setEditingPlayerCodeInput(player.code || '');
  };

  const handleSavePlayerCustomCode = (playerId, customValue) => {
    const cleaned = (
      customValue !== undefined ? customValue : editingPlayerCodeInput
    )
      .trim()
      .toUpperCase();

    if (cleaned.length < 2 || cleaned.length > 6) {
      triggerToast('Player code should be 2 to 6 characters (e.g. 4 chars).');
      return;
    }

    const duplicate = gameState.players.find(
      (p) =>
        p.id !== playerId &&
        p.id !== gameState.godPlayerId &&
        p.code.toUpperCase() === cleaned
    );
    if (duplicate) {
      triggerToast(
        `Code "${cleaned}" is already assigned to ${duplicate.name}.`
      );
      return;
    }

    commitGameState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === playerId ? { ...p, code: cleaned } : p
      ),
    }));

    setEditingPlayerId(null);
    setEditingPlayerCodeInput('');
    triggerToast(`Updated player cipher code to ${cleaned}.`);
  };

  const handleRegenerateSinglePlayerCode = (playerId) => {
    const existing = new Set(
      gameState.players
        .filter((p) => p.id !== playerId)
        .map((p) => p.code.toUpperCase())
    );
    const freshCode = generatePlayerCode(existing);
    setEditingPlayerCodeInput(freshCode);
    handleSavePlayerCustomCode(playerId, freshCode);
  };

  // ============================================================================
  // 6. STEP 1: LOBBY & ANIMATED "GOD" SHUFFLE
  // ============================================================================
  const handleAddPlayer = (e) => {
    e.preventDefault();
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;
    if (gameState.players.length >= 16) {
      triggerToast('Maximum 16 players supported in the parlor.');
      return;
    }
    if (
      gameState.players.some(
        (p) => p.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      triggerToast('A guest with that name is already in the lobby.');
      return;
    }

    const newId = `p_${Date.now()}`;
    commitGameState((prev) => {
      const updatedPlayers = [
        ...prev.players,
        {
          id: newId,
          name: trimmed,
          code: '',
          role: 'VILLAGER',
          isGod: false,
          status: 'ALIVE',
          eliminatedRound: null,
          eliminatedReason: '',
        },
      ];
      const activeCount = updatedPlayers.length - 1;
      return {
        ...prev,
        players: updatedPlayers,
        roleCounts: getSmartRolePreset(activeCount, prev.includePoliceRole),
      };
    });
    setNewPlayerName('');
  };

  const handleRemovePlayer = (id) => {
    if (gameState.players.length <= 5) {
      triggerToast('Minimum 5 total participants required (1 God + 4 Players).');
      return;
    }
    commitGameState((prev) => {
      const filtered = prev.players.filter((p) => p.id !== id);
      let nextGodId = prev.godPlayerId;
      if (nextGodId === id) {
        nextGodId = filtered[0].id;
      }
      const normalized = filtered.map((p) => ({
        ...p,
        isGod: p.id === nextGodId,
      }));
      return {
        ...prev,
        players: normalized,
        godPlayerId: nextGodId,
        roleCounts: getSmartRolePreset(
          normalized.length - 1,
          prev.includePoliceRole
        ),
      };
    });
  };

  const handleManualSelectGod = (playerId) => {
    if (isShufflingGod) return;
    commitGameState((prev) => ({
      ...prev,
      godPlayerId: playerId,
      players: prev.players.map((p) => ({
        ...p,
        isGod: p.id === playerId,
      })),
    }));
  };

  const handleAnimatedShuffleGod = () => {
    if (isShufflingGod || gameState.players.length < 2) return;
    setIsShufflingGod(true);
    const totalPlayers = gameState.players.length;
    const totalTicks = 20 + Math.floor(Math.random() * 8);
    let currentTick = 0;

    const runStep = () => {
      const idx = currentTick % totalPlayers;
      setShuffleHighlightIndex(idx);
      currentTick++;

      if (currentTick < totalTicks) {
        const delay = 55 + Math.floor(currentTick * 9);
        setTimeout(runStep, delay);
      } else {
        const winnerIndex = Math.floor(Math.random() * totalPlayers);
        const chosenGod = gameState.players[winnerIndex];
        setShuffleHighlightIndex(winnerIndex);

        setTimeout(() => {
          commitGameState((prev) => ({
            ...prev,
            godPlayerId: chosenGod.id,
            players: prev.players.map((p) => ({
              ...p,
              isGod: p.id === chosenGod.id,
            })),
          }));
          setIsShufflingGod(false);
          setShuffleHighlightIndex(null);
          triggerToast(`${chosenGod.name} has been chosen as the God!`);
        }, 450);
      }
    };

    runStep();
  };

  // ============================================================================
  // 7. STEP 2: ROLE DECK CUSTOMIZER & UNIQUE 4-CHARACTER CIPHER DEAL
  // ============================================================================
  const adjustRoleCount = (roleKey, delta) => {
    commitGameState((prev) => {
      const currentVal = prev.roleCounts[roleKey] || 0;
      const nextVal = Math.max(0, currentVal + delta);
      return {
        ...prev,
        roleCounts: {
          ...prev.roleCounts,
          [roleKey]: nextVal,
        },
      };
    });
  };

  const totalConfiguredRoles = useMemo(() => {
    return Object.values(gameState.roleCounts).reduce((a, b) => a + b, 0);
  }, [gameState.roleCounts]);

  const handleDealChitsAndGenerateCodes = () => {
    const activeCount = activeNonGodPlayers.length;
    if (totalConfiguredRoles !== activeCount) {
      triggerToast(
        `Role count (${totalConfiguredRoles}) must equal active players (${activeCount}).`
      );
      return;
    }

    // Build role deck array and Fisher-Yates shuffle
    const deck = [];
    Object.entries(gameState.roleCounts).forEach(([roleKey, count]) => {
      for (let i = 0; i < count; i++) {
        deck.push(roleKey);
      }
    });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    const codeSet = new Set();
    let deckIdx = 0;

    commitGameState((prev) => {
      const dealtPlayers = prev.players.map((p) => {
        if (p.id === prev.godPlayerId) {
          return {
            ...p,
            isGod: true,
            role: 'GOD',
            code: 'MOD',
            status: 'ALIVE',
            eliminatedRound: null,
            eliminatedReason: '',
          };
        }
        const assignedRole = deck[deckIdx++] || 'VILLAGER';
        const assignedCode = generatePlayerCode(codeSet);
        return {
          ...p,
          isGod: false,
          role: assignedRole,
          code: assignedCode,
          status: 'ALIVE',
          eliminatedRound: null,
          eliminatedReason: '',
        };
      });

      return {
        ...prev,
        phase: 'CHIT_DISTRIBUTION',
        roundNumber: 1,
        winner: null,
        winReason: '',
        godPasscode: prev.godPasscode || '0000',
        players: dealtPlayers,
        nightState: {
          step: 1,
          murdererTargetId: null,
          doctorSaveId: null,
          lastDoctorSaveId: null,
          detectiveCheckId: null,
        },
        dayState: {
          lastNightHeadline: '',
          lastNightEliminatedId: null,
          votesByVoter: {},
          manualVoteTallies: {},
          policeArrestUsed: false,
          policeArrestedId: null,
          eliminatedTodayId: null,
        },
        chronicle: [
          {
            id: `deal_${Date.now()}`,
            title: 'Chits Sealed & Codes Assigned',
            detail: `${dealtPlayers.length - 1} folded chits were dealt by ${
              prev.players.find((pl) => pl.id === prev.godPlayerId)?.name ||
              'God'
            }.`,
          },
        ],
      };
    });

    setUnlockedPlayerId(null);
    setChitPinInput('');
    setIsGodAuthenticated(true);
    setActivePerspective('GOD');
    setScreen('GAME_TABLE');
    triggerToast('Chits shuffled & 4-character secret codes assigned!');
  };

  // ============================================================================
  // 8. STEP 3: UNLOCKING A CHIT BY 4-CHARACTER SECRET CODE
  // ============================================================================
  const handleUnlockChitByCode = (e) => {
    if (e) e.preventDefault();
    const cleaned = chitPinInput.trim().toUpperCase();
    if (!cleaned) {
      setChitPinError('Please enter your personal cipher code.');
      return;
    }

    const matchedPlayer = gameState.players.find(
      (p) => p.id !== gameState.godPlayerId && p.code.toUpperCase() === cleaned
    );

    if (!matchedPlayer) {
      setChitPinError(
        'No chit matches that code. Verify your personal cipher with the God.'
      );
      return;
    }

    setChitPinError('');
    setUnlockedPlayerId(matchedPlayer.id);
  };

  // ============================================================================
  // 9. STEP 4: NIGHT / DAY CYCLE & WIN DETECTION
  // ============================================================================
  const evaluateWinCondition = (playersList, godId) => {
    const living = playersList.filter(
      (p) => p.id !== godId && p.status === 'ALIVE'
    );
    const livingMurderers = living.filter((p) => p.role === 'MURDERER').length;
    const livingInnocents = living.filter((p) => p.role !== 'MURDERER').length;

    if (livingMurderers === 0) {
      return {
        winner: 'VILLAGER',
        reason:
          'Every Murderer has been unmasked. Peace returns to the parlor!',
      };
    }
    if (livingMurderers >= livingInnocents) {
      return {
        winner: 'MURDERER',
        reason:
          'The Murderers have achieved parity with the living guests and seized the parlor!',
      };
    }
    return null;
  };

  const beginNightPhase = () => {
    setTimerRunning(false);
    commitGameState((prev) => ({
      ...prev,
      phase: 'NIGHT',
      nightState: {
        ...prev.nightState,
        step: 1,
        murdererTargetId: null,
        doctorSaveId: null,
        detectiveCheckId: null,
      },
    }));
  };

  const resolveNightAndTransitionToDay = () => {
    commitGameState((prev) => {
      const targetId = prev.nightState.murdererTargetId;
      const savedId = prev.nightState.doctorSaveId;
      let eliminatedPlayer = null;

      const updatedPlayers = prev.players.map((p) => {
        if (targetId && p.id === targetId && targetId !== savedId) {
          eliminatedPlayer = p;
          return {
            ...p,
            status: 'ELIMINATED',
            eliminatedRound: prev.roundNumber,
            eliminatedReason: `Eliminated during Night ${prev.roundNumber}`,
          };
        }
        return p;
      });

      const headline = eliminatedPlayer
        ? `${eliminatedPlayer.name} was found eliminated at dawn.`
        : savedId && targetId === savedId
        ? `An attempt was made in the dark, but the Physician intervened—nobody died tonight!`
        : `The candles flickered, yet nobody died tonight.`;

      const winCheck = evaluateWinCondition(updatedPlayers, prev.godPlayerId);

      const nextChronicle = [
        ...prev.chronicle,
        {
          id: `night_${prev.roundNumber}_${Date.now()}`,
          title: `Dawn of Day ${prev.roundNumber}`,
          detail: headline,
        },
      ];

      return {
        ...prev,
        players: updatedPlayers,
        phase: winCheck ? 'GAME_OVER' : 'DAY',
        winner: winCheck ? winCheck.winner : null,
        winReason: winCheck ? winCheck.reason : '',
        nightState: {
          ...prev.nightState,
          lastDoctorSaveId: savedId,
        },
        dayState: {
          ...prev.dayState,
          lastNightHeadline: headline,
          lastNightEliminatedId: eliminatedPlayer ? eliminatedPlayer.id : null,
          votesByVoter: {},
          manualVoteTallies: {},
          eliminatedTodayId: null,
        },
        chronicle: nextChronicle,
      };
    });

    setTimerSeconds(timerPresetMinutes * 60);
    setTimerRunning(false);
  };

  // Cast vote from player's own phone (Online / Unlocked view)
  const handlePlayerCastVote = (voterId, suspectId) => {
    const cur = gameStateRef.current;
    const voter = cur.players.find((p) => p.id === voterId);
    if (cur.phase !== 'DAY' || !voter || voter.status !== 'ALIVE') {
      triggerToast('Voting is closed.');
      return;
    }
    const next = {
      ...cur,
      dayState: {
        ...cur.dayState,
        votesByVoter: { ...(cur.dayState.votesByVoter || {}), [voterId]: suspectId },
      },
    };
    gameStateRef.current = next;
    setGameState(next);
    if (gameMode === 'ONLINE' && roomCode && db && user) {
      // Field-level update: simultaneous votes from different phones no longer overwrite each other
      updateDoc(getRoomRef(roomCode), {
        [`dayState.votesByVoter.${voterId}`]: suspectId,
      }).catch((e) => {
        console.warn('Vote sync error:', e);
        triggerToast('Vote failed to sync — please try again.');
      });
    }
    triggerToast('Your ballot has been recorded.');
  };

  // Adjust manual vote tally on God's console
  const handleGodAdjustManualVote = (suspectId, delta) => {
    commitGameState((prev) => {
      const current = prev.dayState.manualVoteTallies[suspectId] || 0;
      const nextVal = Math.max(0, current + delta);
      return {
        ...prev,
        dayState: {
          ...prev.dayState,
          manualVoteTallies: {
            ...prev.dayState.manualVoteTallies,
            [suspectId]: nextVal,
          },
        },
      };
    });
  };

  // Compute combined vote tally for each living player
  const combinedVoteTallies = useMemo(() => {
    const tallies = {};
    livingActivePlayers.forEach((p) => {
      tallies[p.id] = gameState.dayState.manualVoteTallies[p.id] || 0;
    });
    Object.values(gameState.dayState.votesByVoter || {}).forEach(
      (suspectId) => {
        if (tallies[suspectId] !== undefined) {
          tallies[suspectId] += 1;
        }
      }
    );
    return tallies;
  }, [
    livingActivePlayers,
    gameState.dayState.manualVoteTallies,
    gameState.dayState.votesByVoter,
  ]);

  // Execute Day Elimination or Police Public Arrest
  const handleEliminateSuspectByVote = (suspectId, isPoliceArrest = false) => {
    const suspect = gameState.players.find((p) => p.id === suspectId);
    if (!suspect) return;

    commitGameState((prev) => {
      const updatedPlayers = prev.players.map((p) => {
        if (p.id === suspectId) {
          return {
            ...p,
            status: isPoliceArrest ? 'ARRESTED' : 'ELIMINATED',
            eliminatedRound: prev.roundNumber,
            eliminatedReason: isPoliceArrest
              ? `Detained by Constable Warrant on Day ${prev.roundNumber}`
              : `Banished by Parlor Ballot on Day ${prev.roundNumber}`,
          };
        }
        return p;
      });

      const winCheck = evaluateWinCondition(updatedPlayers, prev.godPlayerId);
      const roleTitle = ROLES[suspect.role]?.title || suspect.role;

      return {
        ...prev,
        players: updatedPlayers,
        phase: winCheck ? 'GAME_OVER' : prev.phase,
        winner: winCheck ? winCheck.winner : null,
        winReason: winCheck ? winCheck.reason : '',
        dayState: {
          ...prev.dayState,
          eliminatedTodayId: suspectId,
          policeArrestUsed: isPoliceArrest
            ? true
            : prev.dayState.policeArrestUsed,
          policeArrestedId: isPoliceArrest
            ? suspectId
            : prev.dayState.policeArrestedId,
        },
        chronicle: [
          ...prev.chronicle,
          {
            id: `day_elim_${Date.now()}`,
            title: isPoliceArrest
              ? `Public Warrant Executed: ${suspect.name}`
              : `Parlor Verdict: ${suspect.name}`,
            detail: `${suspect.name} was unmasked as ${roleTitle}.`,
          },
        ],
      };
    });
  };

  const handleAdvanceToNextNight = () => {
    setTimerRunning(false);
    commitGameState((prev) => ({
      ...prev,
      roundNumber: prev.roundNumber + 1,
      phase: 'NIGHT',
      nightState: {
        ...prev.nightState,
        step: 1,
        murdererTargetId: null,
        doctorSaveId: null,
        detectiveCheckId: null,
      },
    }));
  };

  const handleNewRoundReshuffleGod = () => {
    setTimerRunning(false);
    setUnlockedPlayerId(null);
    setChitPinInput('');
    setIsGodAuthenticated(true);
    commitGameState((prev) => ({
      ...prev,
      phase: 'LOBBY',
      winner: null,
      winReason: '',
      players: prev.players.map((p) => ({
        ...p,
        status: 'ALIVE',
        code: '',
        eliminatedRound: null,
        eliminatedReason: '',
      })),
    }));
    setScreen('LOBBY');
  };

  // Format mm:ss timer
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ============================================================================
  // RENDERING VIEWS
  // ============================================================================
  return (
    <div
      className={`min-h-screen flex flex-col justify-between relative selection:bg-[#9E7642]/20 transition-colors duration-700 ${
        isNocturnalNight ? 'text-[#F5EFE6]' : 'text-[#14362B]'
      }`}
      style={{
        backgroundColor: isNocturnalNight ? '#0D1F19' : '#FAF7F0',
        backgroundImage: isNocturnalNight
          ? 'radial-gradient(rgba(166, 124, 70, 0.16) 2px, transparent 2px)'
          : 'radial-gradient(#E4DDD0 2px, transparent 2px)',
        backgroundSize: '24px 24px',
        fontFamily:
          "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Inject Google Fonts for Editorial Serif & Clean Sans */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        .font-serif {
          font-family: 'Playfair Display', Georgia, serif;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.28s ease-out forwards;
        }
      `}</style>

      {/* FLOATING TOAST BANNER */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#14362B] text-[#FAF7F0] px-5 py-3 rounded-full shadow-xl border border-[#9E7642]/50 text-xs tracking-wide flex items-center gap-2.5 animate-fadeIn">
          <Sparkles className="w-4 h-4 text-[#D8C3A5]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* QR CODE & ROOM INVITE MODAL */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-[#14362B]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFDF9] border border-[#E5DEC9] rounded-3xl max-w-md w-full p-8 shadow-2xl text-center relative animate-fadeIn text-[#14362B]">
            <Eyebrow className="justify-center mb-2">PARLOR ROOM SEAL</Eyebrow>
            <h3 className="font-serif text-3xl text-[#14362B] mb-2">
              Room <span className="italic text-[#A67C46]">{roomCode}</span>
            </h3>
            <p className="text-xs text-[#4A5D56] mb-6">
              Scan this parlor seal or enter the 5-character Room Code on any
              phone to join in real time.
            </p>

            {/* Crisp Editorial QR Representation */}
            <div className="w-48 h-48 mx-auto bg-[#FAF7F0] border-2 border-[#E5DEC9] rounded-2xl p-4 flex flex-col items-center justify-center mb-6 shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=14362B&bgcolor=FAF7F0&data=${encodeURIComponent(
                  `${window.location.origin}${window.location.pathname}?room=${roomCode}`
                )}`}
                alt={`QR Code for Room ${roomCode}`}
                className="w-full h-full object-contain rounded"
              />
            </div>

            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="font-mono text-2xl font-bold tracking-[0.25em] bg-[#FAF7F0] px-5 py-2 rounded-xl border border-[#D8D1C5] text-[#14362B]">
                {roomCode}
              </span>
              <SecondaryButton
                onClick={() =>
                  copyToClipboard(roomCode, `Room code ${roomCode} copied!`)
                }
                className="py-2.5 px-4"
              >
                <Copy className="w-4 h-4" />
                <span>Copy</span>
              </SecondaryButton>
            </div>

            <PrimaryButton
              onClick={() => setShowQrModal(false)}
              className="w-full"
              showArrow={false}
            >
              Return to Parlor
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* TOP EDITORIAL MASTHEAD NAVIGATION */}
      <header
        className={`w-full border-b backdrop-blur-xs sticky top-0 z-30 transition-colors duration-700 ${
          isNocturnalNight
            ? 'border-[#284C3F] bg-[#0D1F19]/90'
            : 'border-[#E5DEC9] bg-[#FAF7F0]/90'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setScreen('LANDING')}
            className="flex items-center gap-3 text-left group cursor-pointer"
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-serif italic text-lg shadow-xs transition-colors ${
                isNocturnalNight
                  ? 'bg-[#A67C46] text-[#0D1F19]'
                  : 'bg-[#1C4538] text-[#FAF7F0] group-hover:bg-[#14362B]'
              }`}
            >
              P
            </div>
            <div>
              <span
                className={`font-serif text-lg sm:text-xl font-semibold tracking-tight block leading-none ${
                  isNocturnalNight ? 'text-[#F5EFE6]' : 'text-[#14362B]'
                }`}
              >
                The Parlor <span className="italic text-[#A67C46]">Chit</span>
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-[#9E7642] block mt-0.5">
                Social Deduction Society
              </span>
            </div>
          </button>

          {/* Status & Room Pill Bar */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isNocturnalNight && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#173329] border border-[#A67C46]/50 text-[11px] font-medium text-[#E6C694]">
                <Moon className="w-3.5 h-3.5 text-[#A67C46]" />
                <span>Nocturnal Hour</span>
              </span>
            )}
            {screen !== 'LANDING' && (
              <>
                {gameMode === 'ONLINE' && roomCode ? (
                  <button
                    type="button"
                    onClick={() => setShowQrModal(true)}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                      isNocturnalNight
                        ? 'bg-[#173329] border-[#284C3F] text-[#F5EFE6] hover:border-[#A67C46]'
                        : 'bg-[#FFFDF9] border-[#D8D1C5] text-[#14362B] hover:border-[#9E7642]'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        syncStatus === 'synced'
                          ? 'bg-emerald-500 animate-pulse'
                          : 'bg-[#9E7642]'
                      }`}
                    />
                    <span className="hidden sm:inline opacity-75">Room:</span>
                    <span className="font-mono font-bold tracking-wider">
                      {roomCode}
                    </span>
                    <QrCode className="w-3.5 h-3.5 text-[#9E7642]" />
                  </button>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs ${
                      isNocturnalNight
                        ? 'bg-[#173329] border-[#284C3F] text-[#C8D6D0]'
                        : 'bg-[#FFFDF9] border-[#E5DEC9] text-[#4A5D56]'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5 text-[#9E7642]" />
                    <span className="hidden sm:inline">Pass & Play Mode</span>
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* =====================================================================
          SCREEN 0: EDITORIAL LANDING & MODE SELECTION
         ===================================================================== */}
      {screen === 'LANDING' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-10 sm:py-16 flex flex-col justify-center">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column: Editorial Headline & Mode Selection */}
            <div className="lg:col-span-7 space-y-6">
              <Eyebrow>EDITION NO. IV • REAL-LIFE PARTY GAME</Eyebrow>

              <h1 className="font-serif text-4xl sm:text-6xl text-[#14362B] leading-[1.08] tracking-tight">
                A quieter, more tactile way to play{' '}
                <span className="italic text-[#A67C46] font-normal">
                  deception.
                </span>
              </h1>

              <p className="text-[#4A5D56] text-base sm:text-lg leading-relaxed max-w-xl">
                Gather in a circle without messy paper scraps. Randomly crown a{' '}
                <strong className="text-[#14362B] font-medium">
                  God (Moderator)
                </strong>
                , deal encrypted 4-character cipher codes, and unfold realistic
                4-fold aged parchment role chits for{' '}
                <em>Murderer, Physician, Inspector, Constable,</em> and{' '}
                <em>Esteemed Guests</em>.
              </p>

              {/* Two Core Mode Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Mode 1: Offline Pass & Play */}
                <div className="bg-[#FFFDF9] border border-[#E5DEC9] rounded-2xl p-6 shadow-xs hover:shadow-md hover:border-[#9E7642]/60 transition-all flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-full bg-[#FAF7F0] border border-[#E5DEC9] flex items-center justify-center text-[#1C4538] mb-4">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[#9E7642] font-semibold">
                      SINGLE DEVICE • CIRCLE
                    </span>
                    <h3 className="font-serif text-2xl text-[#14362B] mt-1 mb-2">
                      Offline Pass & Play
                    </h3>
                    <p className="text-xs text-[#4A5D56] leading-relaxed mb-6">
                      Pass one phone or tablet around the room. The God Console
                      locks with a Moderator PIN while players type their
                      personal cipher to unfold their 4-fold chit.
                    </p>
                  </div>
                  <PrimaryButton onClick={startOfflineMode} className="w-full">
                    Host Pass & Play
                  </PrimaryButton>
                </div>

                {/* Mode 2: Online Multi-Device Live Room */}
                <div className="bg-[#FFFDF9] border border-[#E5DEC9] rounded-2xl p-6 shadow-xs hover:shadow-md hover:border-[#9E7642]/60 transition-all flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-full bg-[#FAF7F0] border border-[#E5DEC9] flex items-center justify-center text-[#9E7642] mb-4">
                      <Wifi className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[#9E7642] font-semibold">
                      MULTI-DEVICE • REAL-TIME SYNC
                    </span>
                    <h3 className="font-serif text-2xl text-[#14362B] mt-1 mb-2">
                      Online Live Room
                    </h3>
                    <p className="text-xs text-[#4A5D56] leading-relaxed mb-6">
                      Generate a 5-character Room Code & QR seal. Friends join
                      from their own phones to unlock their chits and cast live
                      daylight ballots.
                    </p>
                  </div>
                  <PrimaryButton onClick={createOnlineRoom} className="w-full">
                    Create Online Room
                  </PrimaryButton>
                </div>
              </div>

              {/* Join Existing Online Room Bar */}
              <form
                onSubmit={handleJoinOnlineRoom}
                className="bg-[#FFFDF9]/90 border border-[#E5DEC9] rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-xl"
              >
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-[0.16em] text-[#9E7642] font-semibold block mb-1">
                    JOIN A FRIEND’S PARLOR ROOM
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    value={joinCodeInput}
                    onChange={(e) =>
                      setJoinCodeInput(e.target.value.toUpperCase())
                    }
                    placeholder="ENTER 5-LETTER ROOM CODE (E.G. K9X2M)"
                    className="w-full bg-transparent text-sm font-mono uppercase tracking-wider text-[#14362B] placeholder:text-[#4A5D56]/50 focus:outline-none"
                  />
                </div>
                <SecondaryButton type="submit" className="shrink-0">
                  Join Room →
                </SecondaryButton>
              </form>
              {joinCodeError && (
                <p className="text-xs text-[#8B2626] font-medium">
                  {joinCodeError}
                </p>
              )}
            </div>

            {/* Right Column: Decorative Specimen Preview Card */}
            <div className="lg:col-span-5">
              <div className="bg-[#FFFDF9] border border-[#E5DEC9] rounded-3xl p-7 sm:p-8 shadow-[0_24px_48px_-15px_rgba(20,54,43,0.1)] relative">
                <div className="flex items-center justify-between border-b border-[#E5DEC9] pb-4 mb-6">
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[#9E7642] font-semibold block">
                      THE DRAMATIS PERSONAE
                    </span>
                    <h3 className="font-serif text-2xl text-[#14362B]">
                      Five Classic Roles
                    </h3>
                  </div>
                  <span className="text-xs font-serif italic text-[#A67C46]">
                    5 – 16 Players
                  </span>
                </div>

                <div className="space-y-3.5">
                  {Object.values(ROLES).map((role) => (
                    <div
                      key={role.id}
                      className="flex items-start gap-3.5 p-3 rounded-xl bg-[#FAF7F0]/80 border border-[#E5DEC9]/80"
                    >
                      <RoleEmblem roleId={role.id} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-serif text-base font-semibold text-[#14362B]">
                            {role.title}
                          </h4>
                          <span
                            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold"
                            style={{
                              backgroundColor: role.badgeBg,
                              color: role.badgeText,
                            }}
                          >
                            {role.shortName}
                          </span>
                        </div>
                        <p className="text-xs text-[#4A5D56] leading-relaxed mt-0.5">
                          {role.ability}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* =====================================================================
          SCREEN 1: PLAYER LOBBY & RANDOM "GOD" SHUFFLE
         ===================================================================== */}
      {screen === 'LOBBY' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 sm:py-12">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <Eyebrow className="mb-2">
                STEP I • ASSEMBLE THE PARLOR CIRCLE
              </Eyebrow>
              <h2 className="font-serif text-3xl sm:text-5xl text-[#14362B]">
                Guest Roster &{' '}
                <span className="italic text-[#A67C46]">God Shuffle</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <SecondaryButton
                onClick={() =>
                  commitGameState((prev) => ({
                    ...prev,
                    players: SAMPLE_PARTIES.classic7.map((name, idx) => ({
                      id: `p_${idx + 1}`,
                      name,
                      code: '',
                      role: 'VILLAGER',
                      isGod: idx === 0,
                      status: 'ALIVE',
                    })),
                    godPlayerId: 'p_1',
                    roleCounts: getSmartRolePreset(6, prev.includePoliceRole),
                  }))
                }
                className="text-xs py-2 px-3.5"
              >
                Load 7-Guest Preset
              </SecondaryButton>
              <SecondaryButton
                onClick={() =>
                  commitGameState((prev) => ({
                    ...prev,
                    players: SAMPLE_PARTIES.salon10.map((name, idx) => ({
                      id: `p_${idx + 1}`,
                      name,
                      code: '',
                      role: 'VILLAGER',
                      isGod: idx === 0,
                      status: 'ALIVE',
                    })),
                    godPlayerId: 'p_1',
                    roleCounts: getSmartRolePreset(9, prev.includePoliceRole),
                  }))
                }
                className="text-xs py-2 px-3.5"
              >
                Load 10-Guest Preset
              </SecondaryButton>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left 7 Cols: Add Players & Roster Grid */}
            <div className="lg:col-span-7 bg-[#FFFDF9] border border-[#E5DEC9] rounded-3xl p-6 sm:p-8 shadow-xs">
              <form onSubmit={handleAddPlayer} className="flex gap-3 mb-6">
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Enter guest name (5 to 16 players)..."
                  className="flex-1 rounded-full bg-[#FAF7F0] border border-[#D8D1C5] px-5 py-3 text-sm text-[#14362B] placeholder:text-[#4A5D56]/60 focus:outline-none focus:border-[#1C4538]"
                />
                <PrimaryButton
                  type="submit"
                  showArrow={false}
                  className="px-5 py-3 shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Guest</span>
                </PrimaryButton>
              </form>

              <div className="flex items-center justify-between text-xs text-[#4A5D56] mb-4 px-1">
                <span>
                  Total in Parlor:{' '}
                  <strong className="text-[#14362B]">
                    {gameState.players.length}
                  </strong>{' '}
                  (1 God + {gameState.players.length - 1} Active Players)
                </span>
                <span className="text-[#9E7642]">
                  Tap crown to manually volunteer as God
                </span>
              </div>

              {/* Player Pills Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {gameState.players.map((p, idx) => {
                  const isCurrentGod = p.id === gameState.godPlayerId;
                  const isHighlighted = shuffleHighlightIndex === idx;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-2xl p-3.5 border transition-all duration-150 flex items-center justify-between ${
                        isHighlighted
                          ? 'bg-[#9E7642] text-[#FFFDF9] border-[#9E7642] scale-[1.03] shadow-md'
                          : isCurrentGod
                          ? 'bg-[#1C4538] text-[#FAF7F0] border-[#1C4538] shadow-xs'
                          : 'bg-[#FAF7F0] text-[#14362B] border-[#E5DEC9]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-full text-xs font-serif flex items-center justify-center shrink-0 ${
                            isCurrentGod || isHighlighted
                              ? 'bg-[#FFFDF9]/20 text-[#FFFDF9]'
                              : 'bg-[#FFFDF9] text-[#9E7642] border border-[#E5DEC9]'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div className="truncate">
                          <p className="font-medium text-sm truncate">
                            {p.name}
                          </p>
                          <p
                            className={`text-[10px] uppercase tracking-wider ${
                              isCurrentGod || isHighlighted
                                ? 'text-[#D8C3A5]'
                                : 'text-[#4A5D56]'
                            }`}
                          >
                            {isCurrentGod
                              ? 'God (Moderator)'
                              : 'Active Chit Player'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          title="Assign as God (Moderator)"
                          onClick={() => handleManualSelectGod(p.id)}
                          className={`p-2 rounded-full transition-colors cursor-pointer ${
                            isCurrentGod
                              ? 'bg-[#9E7642] text-[#FFFDF9]'
                              : 'hover:bg-[#E5DEC9]/60 text-[#9E7642]'
                          }`}
                        >
                          <Crown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Remove guest"
                          onClick={() => handleRemovePlayer(p.id)}
                          className={`p-2 rounded-full transition-colors cursor-pointer ${
                            isCurrentGod || isHighlighted
                              ? 'hover:bg-white/10 text-[#FAF7F0]/70'
                              : 'hover:bg-[#8B2626]/10 text-[#4A5D56] hover:text-[#8B2626]'
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 5 Cols: Animated Shuffle for God Card */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-[#FFFDF9] border border-[#E5DEC9] rounded-3xl p-6 sm:p-8 shadow-xs">
              <div>
                <Eyebrow className="mb-3">RANDOM MODERATOR CEREMONY</Eyebrow>
                <h3 className="font-serif text-3xl text-[#14362B] mb-2">
                  Who shall preside as{' '}
                  <span className="italic text-[#A67C46]">God?</span>
                </h3>
                <p className="text-xs sm:text-sm text-[#4A5D56] leading-relaxed mb-6">
                  Every round needs one impartial Moderator to read the night
                  prompts and manage the ledger. Spin the parlor shuffle to let
                  fate crown tonight’s God, or tap any crown icon to volunteer.
                </p>

                {/* Featured Current God Pedestal */}
                <div className="rounded-2xl bg-[#FAF7F0] border border-[#E5DEC9] p-6 text-center mb-6 relative overflow-hidden">
                  <div className="w-14 h-14 rounded-full bg-[#1C4538] text-[#D8C3A5] flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <Crown className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#9E7642] font-semibold block">
                    ANNOINTED MODERATOR (GOD)
                  </span>
                  <h4 className="font-serif text-3xl text-[#14362B] mt-1">
                    {isShufflingGod
                      ? gameState.players[shuffleHighlightIndex ?? 0]?.name
                      : godPlayer?.name}
                  </h4>
                  <p className="text-xs text-[#4A5D56] mt-1">
                    All other {gameState.players.length - 1} guests will receive
                    secret role chits.
                  </p>
                </div>

                <SecondaryButton
                  onClick={handleAnimatedShuffleGod}
                  disabled={isShufflingGod}
                  className="w-full py-3.5 mb-4 border-[#9E7642]/50"
                >
                  <Shuffle
                    className={`w-4 h-4 text-[#9E7642] ${
                      isShufflingGod ? 'animate-spin' : ''
                    }`}
                  />
                  <span>
                    {isShufflingGod
                      ? 'Shuffling the Parlor Cards...'
                      : 'Animated Shuffle for God'}
                  </span>
                </SecondaryButton>
              </div>

              <div className="pt-4 border-t border-[#E5DEC9]">
                <PrimaryButton
                  onClick={() => {
                    commitGameState((prev) => ({
                      ...prev,
                      phase: 'ROLE_SETUP',
                      roleCounts: getSmartRolePreset(
                        prev.players.length - 1,
                        prev.includePoliceRole
                      ),
                    }));
                    setScreen('ROLE_SETUP');
                  }}
                  className="w-full py-4"
                >
                  Proceed to Role Deck Setup
                </PrimaryButton>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* =====================================================================
          SCREEN 2: ROLE DECK CUSTOMIZER & GOD SECURITY SETUP
         ===================================================================== */}
      {screen === 'ROLE_SETUP' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 sm:py-12">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <Eyebrow className="mb-2">
                STEP II • CONFIGURE THE CHIT DECK ({activeNonGodPlayers.length}{' '}
                ACTIVE PLAYERS)
              </Eyebrow>
              <h2 className="font-serif text-3xl sm:text-5xl text-[#14362B]">
                Compose tonight’s{' '}
                <span className="italic text-[#A67C46]">allegiances.</span>
              </h2>
            </div>
            <SecondaryButton
              onClick={() => setScreen('LOBBY')}
              className="text-xs py-2.5 px-4"
            >
              ← Back to Guest Roster
            </SecondaryButton>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left 8 Cols: Role Customizer Cards */}
            <div className="lg:col-span-8 space-y-4">
              {Object.values(ROLES).map((role) => {
                const count = gameState.roleCounts[role.id] || 0;
                return (
                  <div
                    key={role.id}
                    className="bg-[#FFFDF9] border border-[#E5DEC9] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
                  >
                    <div className="flex items-start gap-4">
                      <RoleEmblem roleId={role.id} size="md" />
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="font-serif text-xl text-[#14362B]">
                            {role.title}
                          </h3>
                          <span
                            className="text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-semibold"
                            style={{
                              backgroundColor: role.badgeBg,
                              color: role.badgeText,
                            }}
                          >
                            {role.shortName}
                          </span>
                        </div>
                        <p className="text-xs text-[#4A5D56] mt-1 max-w-lg leading-relaxed">
                          {role.ability}
                        </p>
                      </div>
                    </div>

                    {/* + / - Counter */}
                    <div className="flex items-center gap-3 self-end sm:self-center bg-[#FAF7F0] border border-[#E5DEC9] rounded-full px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => adjustRoleCount(role.id, -1)}
                        className="w-8 h-8 rounded-full bg-[#FFFDF9] border border-[#D8D1C5] flex items-center justify-center text-[#14362B] hover:bg-[#E5DEC9] cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-serif text-xl font-semibold w-6 text-center text-[#14362B]">
                        {count}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustRoleCount(role.id, 1)}
                        className="w-8 h-8 rounded-full bg-[#1C4538] text-[#FAF7F0] flex items-center justify-center hover:bg-[#14362B] cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right 4 Cols: Smart Presets, God PIN Setup & Seal Action */}
            <div className="lg:col-span-4 bg-[#FFFDF9] border border-[#E5DEC9] rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col justify-between">
              <div>
                <Eyebrow className="mb-3">DECK BALANCE & HOUSE RULES</Eyebrow>
                <h3 className="font-serif text-2xl text-[#14362B] mb-4">
                  Moderator’s Seal
                </h3>

                <div className="p-4 rounded-2xl bg-[#FAF7F0] border border-[#E5DEC9] mb-5 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#4A5D56]">Moderator (God):</span>
                    <strong className="text-[#14362B]">
                      {godPlayer?.name}
                    </strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#4A5D56]">Active Chit Players:</span>
                    <strong className="text-[#14362B]">
                      {activeNonGodPlayers.length}
                    </strong>
                  </div>
                  <div className="flex justify-between text-xs pt-2 border-t border-[#E5DEC9]">
                    <span className="text-[#4A5D56]">Total Chits in Deck:</span>
                    <strong
                      className={
                        totalConfiguredRoles === activeNonGodPlayers.length
                          ? 'text-[#1C4538]'
                          : 'text-[#8B2626]'
                      }
                    >
                      {totalConfiguredRoles} / {activeNonGodPlayers.length}
                    </strong>
                  </div>
                </div>

                {/* Smart Balance Preset Buttons */}
                <div className="space-y-2 mb-6">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-[#9E7642] font-semibold block">
                    SMART ROLE PRESETS
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <SecondaryButton
                      onClick={() =>
                        commitGameState((prev) => ({
                          ...prev,
                          includePoliceRole: false,
                          roleCounts: getSmartRolePreset(
                            activeNonGodPlayers.length,
                            false
                          ),
                        }))
                      }
                      className="text-xs py-2.5 px-3"
                    >
                      Classic Parlor
                    </SecondaryButton>
                    <SecondaryButton
                      onClick={() =>
                        commitGameState((prev) => ({
                          ...prev,
                          includePoliceRole: true,
                          roleCounts: getSmartRolePreset(
                            activeNonGodPlayers.length,
                            true
                          ),
                        }))
                      }
                      className="text-xs py-2.5 px-3"
                    >
                      + Constable Role
                    </SecondaryButton>
                  </div>
                </div>

                {/* God Console Passcode & House Rules */}
                <div className="mb-6 space-y-4">
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[#9E7642] font-semibold block mb-2">
                      GOD CONSOLE SECURITY PIN
                    </span>
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-[#9E7642] shrink-0" />
                      <input
                        type="text"
                        maxLength={8}
                        value={gameState.godPasscode || ''}
                        onChange={(e) =>
                          commitGameState((prev) => ({
                            ...prev,
                            godPasscode: e.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="0000"
                        className="w-full rounded-xl bg-[#FAF7F0] border border-[#D8D1C5] px-3 py-2 text-xs font-mono uppercase tracking-widest text-[#14362B] focus:outline-none focus:border-[#1C4538]"
                      />
                    </div>
                    <p className="text-[11px] text-[#4A5D56] mt-1">
                      Secures the God Console so other players cannot peek when
                      passing the device.
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[#9E7642] font-semibold block mb-2">
                      PARLOR HOUSE RULES
                    </span>
                    <label className="flex items-start gap-3 cursor-pointer text-xs text-[#4A5D56]">
                      <input
                        type="checkbox"
                        checked={
                          gameState.rules.preventConsecutiveDoctorSelfSave
                        }
                        onChange={(e) =>
                          commitGameState((prev) => ({
                            ...prev,
                            rules: {
                              ...prev.rules,
                              preventConsecutiveDoctorSelfSave:
                                e.target.checked,
                            },
                          }))
                        }
                        className="mt-0.5 accent-[#1C4538]"
                      />
                      <span>
                        <strong>Physician’s Restraint:</strong> Doctor cannot
                        save the exact same person two nights in a row.
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {totalConfiguredRoles !== activeNonGodPlayers.length && (
                  <p className="text-xs text-[#8B2626] text-center">
                    Please adjust role counts so total chits equal{' '}
                    {activeNonGodPlayers.length}.
                  </p>
                )}
                <PrimaryButton
                  onClick={handleDealChitsAndGenerateCodes}
                  disabled={totalConfiguredRoles !== activeNonGodPlayers.length}
                  className="w-full py-4"
                >
                  Seal Chits & Generate Codes
                </PrimaryButton>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* =====================================================================
          SCREEN 3: MAIN GAME TABLE (GOD DASHBOARD + CHIT REVEAL + NIGHT/DAY)
         ===================================================================== */}
      {screen === 'GAME_TABLE' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-10">
          {/* Top Perspective Bar: Switch between God Dashboard & Player Chit/Voting View */}
          <div
            className={`border rounded-2xl p-3 sm:p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs transition-colors duration-700 ${
              isNocturnalNight
                ? 'bg-[#132A22] border-[#284C3F]'
                : 'bg-[#FFFDF9] border-[#E5DEC9]'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`text-[10px] uppercase tracking-[0.18em] font-semibold px-2.5 py-1 rounded border ${
                  isNocturnalNight
                    ? 'bg-[#173329] border-[#284C3F] text-[#E6C694]'
                    : 'bg-[#FAF7F0] border-[#E5DEC9] text-[#9E7642]'
                }`}
              >
                ROUND {gameState.roundNumber} •{' '}
                {gameState.phase.replace('_', ' ')}
              </span>
              <span
                className={`text-xs ${
                  isNocturnalNight ? 'text-[#C8D6D0]' : 'text-[#4A5D56]'
                }`}
              >
                God:{' '}
                <strong
                  className={
                    isNocturnalNight ? 'text-[#F5EFE6]' : 'text-[#14362B]'
                  }
                >
                  {godPlayer?.name}
                </strong>
              </span>
              {activePerspective === 'GOD' && isGodAuthenticated && (
                <button
                  type="button"
                  onClick={handleLockGodConsoleAndSwitchToKiosk}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full bg-[#9E7642]/15 text-[#9E7642] border border-[#9E7642]/40 hover:bg-[#9E7642] hover:text-[#FFFDF9] transition-colors cursor-pointer"
                >
                  <Lock className="w-3 h-3" />
                  <span>Lock Console & Pass Device</span>
                </button>
              )}
            </div>

            {/* Perspective Toggle Buttons */}
            <div
              className={`flex items-center gap-2 p-1 rounded-full border w-full sm:w-auto justify-center ${
                isNocturnalNight
                  ? 'bg-[#0D1F19] border-[#284C3F]'
                  : 'bg-[#FAF7F0] border-[#D8D1C5]'
              }`}
            >
              <button
                type="button"
                onClick={handleSwitchToGodTab}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  activePerspective === 'GOD'
                    ? 'bg-[#1C4538] text-[#FAF7F0] shadow-xs'
                    : isNocturnalNight
                    ? 'text-[#C8D6D0] hover:text-[#E6C694]'
                    : 'text-[#14362B] hover:text-[#9E7642]'
                }`}
              >
                <Crown className="w-3.5 h-3.5" />
                <span>God Console</span>
                {!isGodAuthenticated && (
                  <Lock className="w-3 h-3 text-[#A67C46]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Switching to Player Chit Kiosk automatically locks the God Console
                  setIsGodAuthenticated(false);
                  setActivePerspective('PLAYER_DEVICE');
                  setUnlockedPlayerId(null);
                  setChitPinInput('');
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  activePerspective === 'PLAYER_DEVICE'
                    ? 'bg-[#1C4538] text-[#FAF7F0] shadow-xs'
                    : isNocturnalNight
                    ? 'text-[#C8D6D0] hover:text-[#E6C694]'
                    : 'text-[#14362B] hover:text-[#9E7642]'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Chit Inspection Kiosk</span>
              </button>
            </div>
          </div>

          {/* =================================================================
              PERSPECTIVE A: PLAYER CHIT UNLOCK & LIVE VOTING VIEW
              (NO TAP-TO-AUTOFILL PILLS — STRICT MANUAL CODE ENTRY)
             ================================================================= */}
          {activePerspective === 'PLAYER_DEVICE' && (
            <div className="max-w-xl mx-auto py-4 animate-fadeIn">
              {gameState.phase === 'LOBBY' || gameState.phase === 'ROLE_SETUP' ? (
                <div className="border rounded-3xl p-8 sm:p-10 shadow-lg text-center bg-[#FFFDF9] border-[#E5DEC9] text-[#14362B]">
                  <Eyebrow className="justify-center mb-3">
                    WAITING FOR THE HOST
                  </Eyebrow>
                  <h2 className="font-serif text-3xl mb-3">
                    The parlor is{' '}
                    <span className="italic text-[#A67C46]">gathering.</span>
                  </h2>
                  <p className="text-sm text-[#4A5D56] leading-relaxed">
                    {godPlayer?.name} is still arranging guests and roles. Your
                    cipher entry will appear here automatically once chits are
                    dealt.
                  </p>
                </div>
              ) : !unlockedPlayerId ? (
                /* Secret Code Entry Card */
                <div
                  className={`border rounded-3xl p-7 sm:p-10 shadow-lg text-center transition-colors duration-700 ${
                    isNocturnalNight
                      ? 'bg-[#173329] border-[#284C3F] text-[#F5EFE6]'
                      : 'bg-[#FFFDF9] border-[#E5DEC9] text-[#14362B]'
                  }`}
                >
                  <Eyebrow className="justify-center mb-3">
                    PRIVATE CHIT VERIFICATION
                  </Eyebrow>
                  <h2
                    className={`font-serif text-3xl sm:text-4xl mb-3 ${
                      isNocturnalNight ? 'text-[#F5EFE6]' : 'text-[#14362B]'
                    }`}
                  >
                    Enter your personal{' '}
                    <span className="italic text-[#A67C46]">cipher.</span>
                  </h2>
                  <p
                    className={`text-sm max-w-md mx-auto mb-8 leading-relaxed ${
                      isNocturnalNight ? 'text-[#C8D6D0]' : 'text-[#4A5D56]'
                    }`}
                  >
                    Type the secret code privately assigned to you by{' '}
                    <strong
                      className={
                        isNocturnalNight ? 'text-[#F5EFE6]' : 'text-[#14362B]'
                      }
                    >
                      {godPlayer?.name}
                    </strong>{' '}
                    (God) to summon and unfold your quad-folded role chit.
                  </p>

                  <form
                    onSubmit={handleUnlockChitByCode}
                    className="max-w-xs mx-auto space-y-5"
                  >
                    <input
                      type="text"
                      maxLength={6}
                      autoComplete="off"
                      value={chitPinInput}
                      onChange={(e) =>
                        setChitPinInput(e.target.value.toUpperCase())
                      }
                      placeholder="• • • •"
                      className={`w-full text-center font-mono text-3xl tracking-[0.35em] uppercase py-4 px-6 rounded-2xl border-2 focus:outline-none transition-colors ${
                        isNocturnalNight
                          ? 'bg-[#0D1F19] border-[#284C3F] text-[#F5EFE6] focus:border-[#A67C46]'
                          : 'bg-[#FAF7F0] border-[#D8D1C5] text-[#14362B] focus:border-[#1C4538]'
                      }`}
                    />
                    {chitPinError && (
                      <p className="text-xs text-[#D96B6B] font-medium">
                        {chitPinError}
                      </p>
                    )}
                    <PrimaryButton type="submit" className="w-full py-4">
                      Verify Cipher & Summon 4-Fold Chit
                    </PrimaryButton>
                  </form>

                  <div
                    className={`mt-8 pt-5 border-t text-xs flex items-center justify-center gap-2 ${
                      isNocturnalNight
                        ? 'border-[#284C3F] text-[#9AB0A6]'
                        : 'border-[#E5DEC9] text-[#4A5D56]'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 text-[#9E7642]" />
                    <span>
                      Strict Cipher Protection Enabled — Codes are hidden from
                      public view.
                    </span>
                  </div>
                </div>
              ) : (
                /* Unlocked Player Hand: Interactive 4-Fold Aged Paper Chit + Live Day Voting */
                <div className="space-y-6 animate-fadeIn">
                  <InteractiveChitCard
                    player={gameState.players.find(
                      (p) => p.id === unlockedPlayerId
                    )}
                    onClose={() => {
                      setUnlockedPlayerId(null);
                      setChitPinInput('');
                    }}
                  />

                  {/* Live Day Voting Panel for Unlocked Player */}
                  {gameState.phase === 'DAY' &&
                    gameState.players.find((p) => p.id === unlockedPlayerId)
                      ?.status === 'ALIVE' && (
                      <div className="bg-[#FFFDF9] border border-[#E5DEC9] rounded-3xl p-6 shadow-sm text-[#14362B]">
                        <Eyebrow className="mb-2">
                          DAY {gameState.roundNumber} • PARLOR BALLOT
                        </Eyebrow>
                        <h3 className="font-serif text-2xl text-[#14362B] mb-2">
                          Cast your accusation{' '}
                          <span className="italic text-[#A67C46]">vote.</span>
                        </h3>
                        <p className="text-xs text-[#4A5D56] mb-4">
                          Tap a living suspect below to register your vote on
                          the Moderator’s tally.
                        </p>
                        <div className="grid grid-cols-2 gap-2.5">
                          {livingActivePlayers.map((suspect) => {
                            const myCurrentVote =
                              gameState.dayState.votesByVoter?.[
                                unlockedPlayerId
                              ];
                            const isVoted = myCurrentVote === suspect.id;
                            return (
                              <button
                                key={suspect.id}
                                type="button"
                                onClick={() =>
                                  handlePlayerCastVote(
                                    unlockedPlayerId,
                                    suspect.id
                                  )
                                }
                                className={`p-3 rounded-xl border text-left text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
                                  isVoted
                                    ? 'bg-[#1C4538] text-[#FAF7F0] border-[#1C4538]'
                                    : 'bg-[#FAF7F0] text-[#14362B] border-[#D8D1C5] hover:border-[#9E7642]'
                                }`}
                              >
                                <span className="truncate">{suspect.name}</span>
                                {isVoted && (
                                  <Check className="w-3.5 h-3.5 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          {/* =================================================================
              PERSPECTIVE B: GOD'S MASTER CONTROL DASHBOARD
              (PROTECTED BY GOD PASSCODE LOCK SCREEN WHEN LOCKED)
             ================================================================= */}
          {activePerspective === 'GOD' && !isGodAuthenticated && (
            <div className="max-w-md mx-auto py-8 animate-fadeIn">
              <div
                className={`border rounded-3xl p-8 sm:p-10 shadow-xl text-center ${
                  isNocturnalNight
                    ? 'bg-[#173329] border-[#284C3F] text-[#F5EFE6]'
                    : 'bg-[#FFFDF9] border-[#E5DEC9] text-[#14362B]'
                }`}
              >
                <div className="w-16 h-16 rounded-full bg-[#1C4538] border border-[#9E7642] text-[#D8C3A5] flex items-center justify-center mx-auto mb-5 shadow-md">
                  <Lock className="w-7 h-7" />
                </div>
                <Eyebrow className="justify-center mb-2">
                  MODERATOR SEAL • RESTRICTED ACCESS
                </Eyebrow>
                <h2
                  className={`font-serif text-3xl mb-2 ${
                    isNocturnalNight ? 'text-[#F5EFE6]' : 'text-[#14362B]'
                  }`}
                >
                  Unlock{' '}
                  <span className="italic text-[#A67C46]">God Console</span>
                </h2>
                <p
                  className={`text-xs sm:text-sm mb-6 leading-relaxed ${
                    isNocturnalNight ? 'text-[#C8D6D0]' : 'text-[#4A5D56]'
                  }`}
                >
                  Only{' '}
                  <strong
                    className={
                      isNocturnalNight ? 'text-[#F5EFE6]' : 'text-[#14362B]'
                    }
                  >
                    {godPlayer?.name}
                  </strong>{' '}
                  (God) may view the Master Ledger and Night Controls. Enter the
                  God Passcode to break the seal.
                </p>

                <form onSubmit={handleVerifyGodPasscode} className="space-y-4">
                  <input
                    type="password"
                    maxLength={8}
                    autoFocus
                    value={godPinAttempt}
                    onChange={(e) =>
                      setGodPinAttempt(e.target.value.toUpperCase())
                    }
                    placeholder="ENTER GOD PIN"
                    className={`w-full text-center font-mono text-2xl tracking-[0.3em] uppercase py-3.5 px-5 rounded-2xl border-2 focus:outline-none ${
                      isNocturnalNight
                        ? 'bg-[#0D1F19] border-[#284C3F] text-[#F5EFE6] focus:border-[#A67C46]'
                        : 'bg-[#FAF7F0] border-[#D8D1C5] text-[#14362B] focus:border-[#1C4538]'
                    }`}
                  />
                  {godPinError && (
                    <p className="text-xs text-[#D96B6B] font-medium">
                      {godPinError}
                    </p>
                  )}
                  <PrimaryButton type="submit" className="w-full py-3.5">
                    Unlock Moderator Console
                  </PrimaryButton>
                </form>

                <div className="mt-6 pt-4 border-t border-[#E5DEC9]/30">
                  <button
                    type="button"
                    onClick={() => setActivePerspective('PLAYER_DEVICE')}
                    className="text-xs text-[#9E7642] hover:underline cursor-pointer"
                  >
                    ← Return to Player Chit Inspection Kiosk
                  </button>
                </div>
              </div>
            </div>
          )}

          {activePerspective === 'GOD' && isGodAuthenticated && (
            <div className="space-y-6">
              {/* GOD SECURITY CODE MANAGEMENT BAR */}
              <div
                className={`border rounded-2xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors duration-700 ${
                  isNocturnalNight
                    ? 'bg-[#173329] border-[#284C3F] text-[#F5EFE6]'
                    : 'bg-[#FFFDF9] border-[#E5DEC9] text-[#14362B]'
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9E7642] uppercase tracking-wider">
                    <KeyRound className="w-3.5 h-3.5" />
                    God Security Passcode:
                  </span>
                  {hideGodSpoilers ? (
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-sm font-bold px-2.5 py-0.5 rounded border tracking-widest ${
                          isNocturnalNight
                            ? 'bg-[#0D1F19] border-[#284C3F] text-[#9AB0A6]'
                            : 'bg-[#FAF7F0] border-[#D8D1C5] text-[#4A5D56]'
                        }`}
                      >
                        ••••
                      </span>
                      <span className="text-[11px] italic text-[#9E7642]">
                        (Unlock Spoilers to view or edit)
                      </span>
                    </div>
                  ) : !isEditingGodPasscode ? (
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-sm font-bold px-2.5 py-0.5 rounded border ${
                          isNocturnalNight
                            ? 'bg-[#0D1F19] border-[#284C3F] text-[#E6C694]'
                            : 'bg-[#FAF7F0] border-[#D8D1C5] text-[#14362B]'
                        }`}
                      >
                        {gameState.godPasscode || '0000'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingGodPasscode(true);
                          setNewGodPasscodeInput(
                            gameState.godPasscode || '0000'
                          );
                        }}
                        className="inline-flex items-center gap-1 text-xs text-[#9E7642] hover:underline cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit God Code
                      </button>
                    </div>
                  ) : (
                    <form
                      onSubmit={handleSaveCustomGodPasscode}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        maxLength={8}
                        value={newGodPasscodeInput}
                        onChange={(e) =>
                          setNewGodPasscodeInput(e.target.value.toUpperCase())
                        }
                        className="w-28 rounded-lg bg-[#FAF7F0] border border-[#9E7642] px-2.5 py-1 text-xs font-mono uppercase text-[#14362B]"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1 rounded-lg bg-[#1C4538] text-[#FAF7F0] text-xs font-medium cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingGodPasscode(false)}
                        className="text-xs text-[#4A5D56] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </form>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleLockGodConsoleAndSwitchToKiosk}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[#1C4538] text-[#FAF7F0] text-xs font-medium hover:bg-[#14362B] transition-colors cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-[#D8C3A5]" />
                  <span>Lock Console & Switch to Player Kiosk</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* LEFT COLUMN (7 COLS): ACTIVE PHASE CONTROLLER (CHIT DISTRIBUTION / NIGHT / DAY / WIN) */}
                <div className="lg:col-span-7 space-y-6">
                  {/* PHASE 1: CHIT DISTRIBUTION BANNER (WITH EDITABLE PLAYER CODES) */}
                  {gameState.phase === 'CHIT_DISTRIBUTION' && (
                    <div className="bg-[#FFFDF9] border border-[#E5DEC9] rounded-3xl p-7 sm:p-8 shadow-sm animate-fadeIn">
                      <Eyebrow className="mb-3">
                        PHASE I • DISTRIBUTE & CUSTOMIZE CIPHER CODES
                      </Eyebrow>
                      <h2 className="font-serif text-3xl sm:text-4xl text-[#14362B] mb-3">
                        Whisper or customize each guest’s{' '}
                        <span className="italic text-[#A67C46]">
                          secret code.
                        </span>
                      </h2>
                      <p className="text-sm text-[#4A5D56] leading-relaxed mb-6">
                        You can customize any guest’s secret code below before
                        sharing it with them. When ready, click{' '}
                        <strong className="text-[#14362B]">
                          “Lock Console & Switch to Player Kiosk”
                        </strong>{' '}
                        so guests can type their code and unfold their 4-fold
                        chit without seeing the God Console.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
                        {activeNonGodPlayers.map((p) => {
                          const isEditingThis = editingPlayerId === p.id;
                          return (
                            <div
                              key={p.id}
                              className="p-3.5 rounded-2xl bg-[#FAF7F0] border border-[#D8D1C5] flex flex-col justify-between gap-2"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-[#14362B] truncate">
                                  {p.name}
                                </p>
                                {!hideGodSpoilers && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        copyToClipboard(
                                          `${p.name}, your secret Parlor Chit code is: ${p.code}`,
                                          `Copied ${p.name}'s code (${p.code})`
                                        )
                                      }
                                      className="p-1.5 rounded-full bg-[#FFFDF9] border border-[#D8D1C5] text-[#14362B] hover:border-[#9E7642] cursor-pointer"
                                      title="Copy code for player"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {hideGodSpoilers ? (
                                <div className="flex items-center justify-between pt-1 border-t border-[#E5DEC9]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-[#4A5D56]">
                                      Code:
                                    </span>
                                    <span className="font-mono text-xs font-bold text-[#4A5D56] bg-[#FFFDF9] px-2 py-0.5 rounded border border-[#D8D1C5] tracking-widest">
                                      ••••
                                    </span>
                                  </div>
                                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#9E7642]">
                                    <Lock className="w-3 h-3" /> Hidden
                                  </span>
                                </div>
                              ) : !isEditingThis ? (
                                <div className="flex items-center justify-between pt-1 border-t border-[#E5DEC9]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-[#4A5D56]">
                                      Code:
                                    </span>
                                    <span className="font-mono text-xs font-bold text-[#14362B] bg-[#FFFDF9] px-2 py-0.5 rounded border border-[#D8D1C5]">
                                      {p.code}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => startEditingPlayerCode(p)}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#9E7642] hover:text-[#14362B] cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Edit Code</span>
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 pt-1 border-t border-[#E5DEC9]">
                                  <input
                                    type="text"
                                    maxLength={6}
                                    value={editingPlayerCodeInput}
                                    onChange={(e) =>
                                      setEditingPlayerCodeInput(
                                        e.target.value.toUpperCase()
                                      )
                                    }
                                    className="w-20 rounded bg-[#FFFDF9] border border-[#9E7642] px-2 py-1 text-xs font-mono uppercase text-[#14362B]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSavePlayerCustomCode(p.id)
                                    }
                                    className="px-2 py-1 rounded bg-[#1C4538] text-[#FAF7F0] text-[11px] font-medium cursor-pointer"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRegenerateSinglePlayerCode(p.id)
                                    }
                                    title="Generate random 4-char code"
                                    className="p-1 rounded bg-[#EFE9DC] text-[#14362B] hover:bg-[#D8D1C5] cursor-pointer"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingPlayerId(null)}
                                    className="p-1 text-[#4A5D56] cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-[#E5DEC9]">
                        <PrimaryButton
                          onClick={beginNightPhase}
                          className="flex-1"
                        >
                          Everyone Has Seen Their Chit — Begin Night 1
                        </PrimaryButton>
                      </div>
                    </div>
                  )}

                  {/* PHASE 2: GUIDED NIGHT PHASE TRACKER (NOCTURNAL STYLING) */}
                  {gameState.phase === 'NIGHT' && (
                    <div className="bg-[#173329] border border-[#284C3F] text-[#F5EFE6] rounded-3xl p-7 sm:p-8 shadow-xl animate-fadeIn transition-colors duration-700">
                      <div className="flex items-center justify-between mb-4">
                        <Eyebrow>
                          NIGHT {gameState.roundNumber} • GUIDED MODERATOR
                          SCRIPT
                        </Eyebrow>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E6C694] bg-[#0D1F19] border border-[#A67C46]/40 px-3 py-1 rounded-full">
                          <Moon className="w-3.5 h-3.5 text-[#A67C46]" /> Step{' '}
                          {gameState.nightState.step} of 4
                        </span>
                      </div>

                      {/* Step Progress Pills */}
                      <div className="grid grid-cols-4 gap-2 mb-6">
                        {[
                          { num: 1, label: '1. Murderer' },
                          { num: 2, label: '2. Doctor' },
                          { num: 3, label: '3. Detective' },
                          { num: 4, label: '4. Dawn' },
                        ].map((s) => (
                          <button
                            key={s.num}
                            type="button"
                            onClick={() =>
                              commitGameState((prev) => ({
                                ...prev,
                                nightState: {
                                  ...prev.nightState,
                                  step: s.num,
                                },
                              }))
                            }
                            className={`py-2 px-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                              gameState.nightState.step === s.num
                                ? 'bg-[#A67C46] text-[#0D1F19] border-[#A67C46] font-semibold'
                                : 'bg-[#0D1F19] text-[#C8D6D0] border-[#284C3F]'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>

                      {/* NIGHT STEP 1: MURDERER WAKES UP */}
                      {gameState.nightState.step === 1 && (
                        <div className="space-y-5 animate-fadeIn">
                          <div className="p-4 rounded-2xl bg-[#0D1F19] border-l-4 border-[#C94A4A]">
                            <span className="text-[10px] uppercase tracking-[0.18em] text-[#E07A7A] font-semibold block mb-1">
                              READ ALOUD TO THE PARLOR
                            </span>
                            <p className="font-serif italic text-lg text-[#F5EFE6]">
                              “Night falls upon the parlor. Everyone close your
                              eyes. Murderers, silently open your eyes and point
                              to the guest you wish to eliminate tonight.”
                            </p>
                          </div>

                          <div>
                            <label className="text-xs uppercase tracking-[0.14em] text-[#C8D6D0] font-semibold block mb-3">
                              TAP WHO THE MURDERER TARGETS:
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                              {livingActivePlayers.map((p) => {
                                const isSelected =
                                  gameState.nightState.murdererTargetId ===
                                  p.id;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() =>
                                      commitGameState((prev) => ({
                                        ...prev,
                                        nightState: {
                                          ...prev.nightState,
                                          murdererTargetId: p.id,
                                        },
                                      }))
                                    }
                                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-[#8B2626] text-[#FAF7F0] border-[#E07A7A] shadow-md'
                                        : 'bg-[#0D1F19] text-[#F5EFE6] border-[#284C3F] hover:border-[#C94A4A]'
                                    }`}
                                  >
                                    <p className="text-sm font-medium truncate">
                                      {p.name}
                                    </p>
                                    <p
                                      className={`text-[10px] uppercase tracking-wider mt-0.5 ${
                                        isSelected
                                          ? 'text-[#FAF7F0]/80'
                                          : 'text-[#9AB0A6]'
                                      }`}
                                    >
                                      {hideGodSpoilers
                                        ? '••••••'
                                        : ROLES[p.role]?.shortName}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex justify-end pt-3">
                            <PrimaryButton
                              onClick={() =>
                                commitGameState((prev) => ({
                                  ...prev,
                                  nightState: { ...prev.nightState, step: 2 },
                                }))
                              }
                            >
                              Murderer Sleeps → Wake Physician
                            </PrimaryButton>
                          </div>
                        </div>
                      )}

                      {/* NIGHT STEP 2: DOCTOR WAKES UP */}
                      {gameState.nightState.step === 2 && (
                        <div className="space-y-5 animate-fadeIn">
                          <div className="p-4 rounded-2xl bg-[#0D1F19] border-l-4 border-[#4FA382]">
                            <span className="text-[10px] uppercase tracking-[0.18em] text-[#6FC4A2] font-semibold block mb-1">
                              READ ALOUD TO THE PARLOR
                            </span>
                            <p className="font-serif italic text-lg text-[#F5EFE6]">
                              “Murderers, close your eyes. Physician, awaken and
                              point to one guest—or yourself—whom you wish to
                              protect from harm tonight.”
                            </p>
                          </div>

                          <div>
                            <label className="text-xs uppercase tracking-[0.14em] text-[#C8D6D0] font-semibold block mb-3">
                              TAP WHO THE DOCTOR SAVES:
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                              {livingActivePlayers.map((p) => {
                                const isSelected =
                                  gameState.nightState.doctorSaveId === p.id;
                                const restrictedByRule =
                                  gameState.rules
                                    .preventConsecutiveDoctorSelfSave &&
                                  gameState.nightState.lastDoctorSaveId ===
                                    p.id;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    disabled={restrictedByRule}
                                    onClick={() =>
                                      commitGameState((prev) => ({
                                        ...prev,
                                        nightState: {
                                          ...prev.nightState,
                                          doctorSaveId: p.id,
                                        },
                                      }))
                                    }
                                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-[#255C49] text-[#FAF7F0] border-[#6FC4A2] shadow-md'
                                        : restrictedByRule
                                        ? 'bg-[#0D1F19]/40 text-[#9AB0A6]/40 border-[#284C3F] cursor-not-allowed'
                                        : 'bg-[#0D1F19] text-[#F5EFE6] border-[#284C3F] hover:border-[#6FC4A2]'
                                    }`}
                                  >
                                    <p className="text-sm font-medium truncate">
                                      {p.name}
                                    </p>
                                    <p
                                      className={`text-[10px] uppercase tracking-wider mt-0.5 ${
                                        isSelected
                                          ? 'text-[#FAF7F0]/80'
                                          : 'text-[#9AB0A6]'
                                      }`}
                                    >
                                      {restrictedByRule
                                        ? 'Saved Last Night'
                                        : hideGodSpoilers
                                        ? '••••••'
                                        : ROLES[p.role]?.shortName}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex justify-between pt-3">
                            <SecondaryButton
                              onClick={() =>
                                commitGameState((prev) => ({
                                  ...prev,
                                  nightState: { ...prev.nightState, step: 1 },
                                }))
                              }
                            >
                              ← Back
                            </SecondaryButton>
                            <PrimaryButton
                              onClick={() =>
                                commitGameState((prev) => ({
                                  ...prev,
                                  nightState: { ...prev.nightState, step: 3 },
                                }))
                              }
                            >
                              Physician Sleeps → Wake Inspector
                            </PrimaryButton>
                          </div>
                        </div>
                      )}

                      {/* NIGHT STEP 3: DETECTIVE WAKES UP + SILENT SIGNAL PROMPT */}
                      {gameState.nightState.step === 3 && (
                        <div className="space-y-5 animate-fadeIn">
                          <div className="p-4 rounded-2xl bg-[#0D1F19] border-l-4 border-[#A67C46]">
                            <span className="text-[10px] uppercase tracking-[0.18em] text-[#E6C694] font-semibold block mb-1">
                              READ ALOUD TO THE PARLOR
                            </span>
                            <p className="font-serif italic text-lg text-[#F5EFE6]">
                              “Physician, close your eyes. Inspector, open your
                              eyes and point to the guest whose true allegiance
                              you wish to investigate.”
                            </p>
                          </div>

                          <div>
                            <label className="text-xs uppercase tracking-[0.14em] text-[#C8D6D0] font-semibold block mb-3">
                              TAP WHO THE DETECTIVE INVESTIGATES:
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                              {livingActivePlayers.map((p) => {
                                const isSelected =
                                  gameState.nightState.detectiveCheckId ===
                                  p.id;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() =>
                                      commitGameState((prev) => ({
                                        ...prev,
                                        nightState: {
                                          ...prev.nightState,
                                          detectiveCheckId: p.id,
                                        },
                                      }))
                                    }
                                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-[#9E7642] text-[#FAF7F0] border-[#E6C694] shadow-md'
                                        : 'bg-[#0D1F19] text-[#F5EFE6] border-[#284C3F] hover:border-[#A67C46]'
                                    }`}
                                  >
                                    <p className="text-sm font-medium truncate">
                                      {p.name}
                                    </p>
                                    <p
                                      className={`text-[10px] uppercase tracking-wider mt-0.5 ${
                                        isSelected
                                          ? 'text-[#FAF7F0]/85'
                                          : 'text-[#9AB0A6]'
                                      }`}
                                    >
                                      Tap to inspect
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* High-Contrast Thumbs Up / Thumbs Down Signal Card for God */}
                          {gameState.nightState.detectiveCheckId && (
                            <div className="mt-4">
                              {(() => {
                                const checkedPlayer = gameState.players.find(
                                  (p) =>
                                    p.id ===
                                    gameState.nightState.detectiveCheckId
                                );
                                const isMurderer =
                                  checkedPlayer?.role === 'MURDERER';
                                return (
                                  <div
                                    className={`p-5 rounded-2xl border-2 flex items-center gap-4 ${
                                      isMurderer
                                        ? 'bg-[#F9ECEC] border-[#8B2626] text-[#7A1C1C]'
                                        : 'bg-[#EBF3F0] border-[#1C4538] text-[#14362B]'
                                    }`}
                                  >
                                    <div
                                      className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                                        isMurderer
                                          ? 'bg-[#8B2626] text-[#FFFDF9]'
                                          : 'bg-[#1C4538] text-[#FFFDF9]'
                                      }`}
                                    >
                                      {isMurderer ? (
                                        <ThumbsUp className="w-6 h-6" />
                                      ) : (
                                        <ThumbsDown className="w-6 h-6" />
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-[10px] uppercase tracking-[0.2em] font-bold block">
                                        SILENT GESTURE FOR GOD TO SIGNAL:
                                      </span>
                                      <h4 className="font-serif text-xl sm:text-2xl font-bold">
                                        {isMurderer
                                          ? `THUMBS UP — ${checkedPlayer?.name} IS A MURDERER`
                                          : `THUMBS DOWN — ${checkedPlayer?.name} IS INNOCENT`}
                                      </h4>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          <div className="flex justify-between pt-3">
                            <SecondaryButton
                              onClick={() =>
                                commitGameState((prev) => ({
                                  ...prev,
                                  nightState: { ...prev.nightState, step: 2 },
                                }))
                              }
                            >
                              ← Back
                            </SecondaryButton>
                            <PrimaryButton
                              onClick={() =>
                                commitGameState((prev) => ({
                                  ...prev,
                                  nightState: { ...prev.nightState, step: 4 },
                                }))
                              }
                            >
                              Review Night Outcome →
                            </PrimaryButton>
                          </div>
                        </div>
                      )}

                      {/* NIGHT STEP 4: DAWN RESOLUTION PREVIEW */}
                      {gameState.nightState.step === 4 && (
                        <div className="space-y-5 animate-fadeIn">
                          <div className="p-5 rounded-2xl bg-[#0D1F19] border border-[#284C3F] space-y-3">
                            <span className="text-[10px] uppercase tracking-[0.18em] text-[#E6C694] font-semibold block">
                              MIDNIGHT LEDGER SUMMARY
                            </span>
                            <div className="flex justify-between text-sm">
                              <span className="text-[#C8D6D0]">
                                Murderer Targeted:
                              </span>
                              <span className="font-semibold text-[#E07A7A]">
                                {gameState.players.find(
                                  (p) =>
                                    p.id ===
                                    gameState.nightState.murdererTargetId
                                )?.name || 'Nobody'}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-[#C8D6D0]">
                                Physician Saved:
                              </span>
                              <span className="font-semibold text-[#6FC4A2]">
                                {gameState.players.find(
                                  (p) =>
                                    p.id === gameState.nightState.doctorSaveId
                                )?.name || 'Nobody'}
                              </span>
                            </div>
                            <div className="border-t border-[#284C3F] pt-3">
                              <p className="font-serif text-lg text-[#F5EFE6]">
                                {gameState.nightState.murdererTargetId &&
                                gameState.nightState.murdererTargetId !==
                                  gameState.nightState.doctorSaveId
                                  ? `Outcome: ${
                                      gameState.players.find(
                                        (p) =>
                                          p.id ===
                                          gameState.nightState.murdererTargetId
                                      )?.name
                                    } will be eliminated at Dawn.`
                                  : `Outcome: The Physician intervened (or no attack occurred) — nobody dies tonight!`}
                              </p>
                            </div>
                          </div>

                          <div className="flex justify-between pt-2">
                            <SecondaryButton
                              onClick={() =>
                                commitGameState((prev) => ({
                                  ...prev,
                                  nightState: { ...prev.nightState, step: 3 },
                                }))
                              }
                            >
                              ← Back
                            </SecondaryButton>
                            <PrimaryButton
                              onClick={resolveNightAndTransitionToDay}
                            >
                              Break Dawn & Announce to Parlor
                            </PrimaryButton>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PHASE 3: DAY DEBATE, TIMER & VOTING TALLY */}
                  {gameState.phase === 'DAY' && (
                    <div className="bg-[#FFFDF9] border border-[#E5DEC9] rounded-3xl p-7 sm:p-8 shadow-sm space-y-6 animate-fadeIn">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Eyebrow>
                          DAYLIGHT {gameState.roundNumber} • PARLOR DELIBERATION
                        </Eyebrow>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8B6229] bg-[#F7EFE2] px-3 py-1 rounded-full">
                          <Sun className="w-3.5 h-3.5" /> Debate & Ballot
                        </span>
                      </div>

                      {/* Dawn Announcement Card */}
                      <div className="p-4 rounded-2xl bg-[#FAF7F0] border border-[#E5DEC9]">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-[#9E7642] font-semibold block mb-1">
                          MORNING DISPATCH
                        </span>
                        <p className="font-serif text-xl text-[#14362B]">
                          “{gameState.dayState.lastNightHeadline}”
                        </p>
                      </div>

                      {/* Discussion Countdown Timer Bar */}
                      <div className="p-5 rounded-2xl bg-[#FAF7F0] border border-[#D8D1C5] flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-[#1C4538] text-[#FAF7F0] flex items-center justify-center">
                            <Timer className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase tracking-[0.18em] text-[#9E7642] font-semibold block">
                              DEBATE COUNTDOWN TIMER
                            </span>
                            <span className="font-mono text-3xl font-bold text-[#14362B]">
                              {formatTime(timerSeconds)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {[2, 3, 5].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => {
                                setTimerPresetMinutes(mins);
                                setTimerSeconds(mins * 60);
                                setTimerRunning(false);
                              }}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
                                timerPresetMinutes === mins
                                  ? 'bg-[#9E7642] text-[#FFFDF9] border-[#9E7642]'
                                  : 'bg-[#FFFDF9] text-[#14362B] border-[#D8D1C5]'
                              }`}
                            >
                              {mins}m
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setTimerRunning((r) => !r)}
                            className="p-2.5 rounded-full bg-[#1C4538] text-[#FAF7F0] hover:bg-[#14362B] cursor-pointer"
                            title={timerRunning ? 'Pause' : 'Start'}
                          >
                            {timerRunning ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTimerRunning(false);
                              setTimerSeconds(timerPresetMinutes * 60);
                            }}
                            className="p-2.5 rounded-full bg-[#FFFDF9] border border-[#D8D1C5] text-[#14362B] hover:bg-[#E5DEC9] cursor-pointer"
                            title="Reset timer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Voting Tally & Elimination Controls */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-xs uppercase tracking-[0.15em] text-[#4A5D56] font-semibold">
                            LIVING SUSPECTS & BALLOT TALLY
                          </label>
                          <span className="text-[11px] text-[#9E7642]">
                            Use + / - to tally votes or banish suspect
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {livingActivePlayers.map((p) => {
                            const votes = combinedVoteTallies[p.id] || 0;
                            const hasPoliceInGame =
                              (gameState.roleCounts.POLICE || 0) > 0;
                            return (
                              <div
                                key={p.id}
                                className="p-3.5 rounded-2xl bg-[#FAF7F0] border border-[#E5DEC9] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div>
                                  <p className="font-medium text-sm text-[#14362B]">
                                    {p.name}
                                  </p>
                                  <p className="text-[11px] text-[#4A5D56]">
                                    Total Ballots:{' '}
                                    <strong className="text-[#14362B]">
                                      {votes}
                                    </strong>
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="inline-flex items-center gap-2 bg-[#FFFDF9] border border-[#D8D1C5] rounded-full px-2.5 py-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleGodAdjustManualVote(p.id, -1)
                                      }
                                      className="w-6 h-6 rounded-full hover:bg-[#FAF7F0] flex items-center justify-center text-[#14362B] cursor-pointer"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <span className="font-mono text-xs font-bold w-5 text-center text-[#14362B]">
                                      {votes}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleGodAdjustManualVote(p.id, 1)
                                      }
                                      className="w-6 h-6 rounded-full hover:bg-[#FAF7F0] flex items-center justify-center text-[#14362B] cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>

                                  {hasPoliceInGame &&
                                    !gameState.dayState.policeArrestUsed && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleEliminateSuspectByVote(
                                            p.id,
                                            true
                                          )
                                        }
                                        className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-[#EBF1F6] text-[#23425C] border border-[#23425C]/30 hover:bg-[#23425C] hover:text-white transition-colors inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <Gavel className="w-3 h-3" />
                                        <span>Constable Arrest</span>
                                      </button>
                                    )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleEliminateSuspectByVote(p.id, false)
                                    }
                                    className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#8B2626] text-[#FFFDF9] hover:bg-[#6E1B1B] transition-colors cursor-pointer"
                                  >
                                    Banish & Unmask
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Revealed Chit Banner if someone was eliminated today */}
                      {gameState.dayState.eliminatedTodayId && (
                        <div className="p-4 rounded-2xl bg-[#F9ECEC] border border-[#8B2626]/40 text-[#7A1C1C]">
                          {(() => {
                            const banished = gameState.players.find(
                              (p) =>
                                p.id === gameState.dayState.eliminatedTodayId
                            );
                            const roleInfo = ROLES[banished?.role];
                            return (
                              <p className="text-sm font-medium">
                                <strong>{banished?.name}</strong> was banished
                                from the parlor. Their unfolded chit revealed:{' '}
                                <strong className="underline">
                                  {roleInfo?.title} ({roleInfo?.shortName})
                                </strong>
                                .
                              </p>
                            );
                          })()}
                        </div>
                      )}

                      <div className="pt-4 border-t border-[#E5DEC9] flex justify-end">
                        <PrimaryButton onClick={handleAdvanceToNextNight}>
                          Conclude Daylight → Enter Night{' '}
                          {gameState.roundNumber + 1}
                        </PrimaryButton>
                      </div>
                    </div>
                  )}

                  {/* PHASE 4: WIN DETECTION & FULL ROLE REVEAL SUMMARY */}
                  {gameState.phase === 'GAME_OVER' && (
                    <div className="bg-[#FFFDF9] border-2 border-[#9E7642] rounded-3xl p-7 sm:p-10 shadow-xl space-y-6 animate-fadeIn">
                      <div className="text-center space-y-3">
                        <div className="w-16 h-16 rounded-full bg-[#1C4538] text-[#D8C3A5] flex items-center justify-center mx-auto shadow-md">
                          <Award className="w-8 h-8" />
                        </div>
                        <Eyebrow className="justify-center">
                          FINAL PARLOR VERDICT
                        </Eyebrow>
                        <h2 className="font-serif text-4xl sm:text-5xl text-[#14362B]">
                          {gameState.winner === 'VILLAGER' ? (
                            <>
                              The Order of the Parlor{' '}
                              <span className="italic text-[#A67C46]">
                                Triumphs!
                              </span>
                            </>
                          ) : (
                            <>
                              The Syndicate of Shadows{' '}
                              <span className="italic text-[#7A1C1C]">
                                Prevails!
                              </span>
                            </>
                          )}
                        </h2>
                        <p className="text-sm text-[#4A5D56] max-w-md mx-auto">
                          {gameState.winReason}
                        </p>
                      </div>

                      {/* Complete Unfolded Chits Summary */}
                      <div className="space-y-2.5 pt-4 border-t border-[#E5DEC9]">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-[#9E7642] font-semibold block">
                          COMPLETE PARLOR UNMASKING
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {activeNonGodPlayers.map((p) => {
                            const r = ROLES[p.role] || ROLES.VILLAGER;
                            return (
                              <div
                                key={p.id}
                                className="p-3.5 rounded-2xl bg-[#FAF7F0] border border-[#E5DEC9] flex items-center justify-between"
                              >
                                <div>
                                  <p className="font-serif text-base font-semibold text-[#14362B]">
                                    {p.name}
                                  </p>
                                  <p className="text-xs text-[#4A5D56]">
                                    {r.title}
                                  </p>
                                </div>
                                <span
                                  className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold"
                                  style={{
                                    backgroundColor: r.badgeBg,
                                    color: r.badgeText,
                                  }}
                                >
                                  {r.shortName}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-4 flex flex-col sm:flex-row gap-3">
                        <PrimaryButton
                          onClick={handleNewRoundReshuffleGod}
                          className="w-full py-4"
                        >
                          New Round (Reshuffle God)
                        </PrimaryButton>
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN (5 COLS): GOD'S MASTER OVERVIEW TABLE & CHRONICLE */}
                <div className="lg:col-span-5 space-y-6">
                  <div
                    className={`border rounded-3xl p-6 shadow-sm transition-colors duration-700 ${
                      isNocturnalNight
                        ? 'bg-[#173329] border-[#284C3F] text-[#F5EFE6]'
                        : 'bg-[#FFFDF9] border-[#E5DEC9] text-[#14362B]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <span className="text-[10px] uppercase tracking-[0.18em] text-[#9E7642] font-semibold block">
                          GOD’S MASTER LEDGER
                        </span>
                        <h3
                          className={`font-serif text-2xl ${
                            isNocturnalNight
                              ? 'text-[#F5EFE6]'
                              : 'text-[#14362B]'
                          }`}
                        >
                          Players, Editable Codes & Roles
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleGodSpoilers}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors cursor-pointer ${
                          hideGodSpoilers
                            ? 'bg-[#9E7642] border-[#9E7642] text-[#FFFDF9] shadow-xs'
                            : isNocturnalNight
                            ? 'bg-[#0D1F19] border-[#284C3F] text-[#F5EFE6] hover:border-[#A67C46]'
                            : 'bg-[#FAF7F0] border-[#D8D1C5] text-[#14362B] hover:border-[#9E7642]'
                        }`}
                      >
                        {hideGodSpoilers ? (
                          <>
                            <Lock className="w-3.5 h-3.5" /> Unlock Codes &
                            Roles
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5 text-[#9E7642]" />{' '}
                            Hide Spoilers
                          </>
                        )}
                      </button>
                    </div>

                    {/* GOD PASSCODE PROMPT TO UNHIDE SPOILERS (CODES & ROLES) */}
                    {hideGodSpoilers && showSpoilerUnlockPrompt && (
                      <form
                        onSubmit={handleVerifySpoilerUnlock}
                        className={`mb-4 p-4 rounded-2xl border animate-fadeIn ${
                          isNocturnalNight
                            ? 'bg-[#0D1F19] border-[#A67C46]/60'
                            : 'bg-[#FAF7F0] border-[#9E7642]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-[#9E7642] font-semibold flex items-center gap-1.5">
                            <KeyRound className="w-3.5 h-3.5" />
                            Enter God Code to Reveal Codes & Roles
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowSpoilerUnlockPrompt(false)}
                            className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            maxLength={8}
                            autoFocus
                            value={spoilerUnlockPinInput}
                            onChange={(e) =>
                              setSpoilerUnlockPinInput(
                                e.target.value.toUpperCase()
                              )
                            }
                            placeholder="GOD CODE"
                            className={`flex-1 rounded-xl border px-3 py-2 text-xs font-mono uppercase tracking-[0.25em] focus:outline-none ${
                              isNocturnalNight
                                ? 'bg-[#173329] border-[#284C3F] text-[#F5EFE6] focus:border-[#A67C46]'
                                : 'bg-[#FFFDF9] border-[#D8D1C5] text-[#14362B] focus:border-[#1C4538]'
                            }`}
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 rounded-xl bg-[#1C4538] text-[#FAF7F0] text-xs font-medium hover:bg-[#14362B] transition-colors cursor-pointer"
                          >
                            Verify & Show
                          </button>
                        </div>
                        {spoilerUnlockError && (
                          <p className="text-[11px] text-[#D96B6B] font-medium mt-2">
                            {spoilerUnlockError}
                          </p>
                        )}
                      </form>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr
                            className={`border-b text-[10px] uppercase tracking-[0.15em] text-[#9E7642] ${
                              isNocturnalNight
                                ? 'border-[#284C3F]'
                                : 'border-[#E5DEC9]'
                            }`}
                          >
                            <th className="py-2.5 pr-2">Guest</th>
                            <th className="py-2.5 px-2">Cipher Code</th>
                            <th className="py-2.5 px-2">Role</th>
                            <th className="py-2.5 pl-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody
                          className={`divide-y text-xs ${
                            isNocturnalNight
                              ? 'divide-[#284C3F]/70'
                              : 'divide-[#E5DEC9]/70'
                          }`}
                        >
                          {activeNonGodPlayers.map((p) => {
                            const roleObj = ROLES[p.role] || ROLES.VILLAGER;
                            const isAlive = p.status === 'ALIVE';
                            const isEditingRow = editingPlayerId === p.id;
                            return (
                              <tr
                                key={p.id}
                                className={!isAlive ? 'opacity-55' : ''}
                              >
                                <td
                                  className={`py-3 pr-2 font-medium ${
                                    isNocturnalNight
                                      ? 'text-[#F5EFE6]'
                                      : 'text-[#14362B]'
                                  }`}
                                >
                                  {p.name}
                                </td>
                                <td className="py-3 px-2">
                                  {hideGodSpoilers ? (
                                    <span
                                      onClick={() =>
                                        setShowSpoilerUnlockPrompt(true)
                                      }
                                      title="Protected — Enter God Code to reveal"
                                      className="inline-flex items-center gap-1 font-mono opacity-60 tracking-widest cursor-pointer"
                                    >
                                      <Lock className="w-3 h-3 text-[#9E7642]" />
                                      ••••
                                    </span>
                                  ) : !isEditingRow ? (
                                    <div className="inline-flex items-center gap-1.5">
                                      <span
                                        className={`font-mono font-semibold px-2 py-0.5 rounded border ${
                                          isNocturnalNight
                                            ? 'bg-[#0D1F19] border-[#284C3F] text-[#E6C694]'
                                            : 'bg-[#FAF7F0] border-[#D8D1C5] text-[#14362B]'
                                        }`}
                                      >
                                        {p.code}
                                      </span>
                                      <button
                                        type="button"
                                        title="Edit player's secret code"
                                        onClick={() =>
                                          startEditingPlayerCode(p)
                                        }
                                        className="p-1 text-[#9E7642] hover:opacity-80 cursor-pointer"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="inline-flex items-center gap-1">
                                      <input
                                        type="text"
                                        maxLength={6}
                                        value={editingPlayerCodeInput}
                                        onChange={(e) =>
                                          setEditingPlayerCodeInput(
                                            e.target.value.toUpperCase()
                                          )
                                        }
                                        className="w-16 rounded bg-[#FAF7F0] border border-[#9E7642] px-1.5 py-0.5 text-xs font-mono uppercase text-[#14362B]"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleSavePlayerCustomCode(p.id)
                                        }
                                        className="p-1 rounded bg-[#1C4538] text-[#FAF7F0] cursor-pointer"
                                        title="Save code"
                                      >
                                        <Check className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingPlayerId(null)}
                                        className="p-1 text-[#9E7642] cursor-pointer"
                                        title="Cancel"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-2">
                                  {hideGodSpoilers ? (
                                    <span
                                      onClick={() =>
                                        setShowSpoilerUnlockPrompt(true)
                                      }
                                      title="Protected — Enter God Code to reveal"
                                      className="opacity-60 italic cursor-pointer"
                                    >
                                      ••••••
                                    </span>
                                  ) : (
                                    <span
                                      className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold"
                                      style={{
                                        backgroundColor: roleObj.badgeBg,
                                        color: roleObj.badgeText,
                                      }}
                                    >
                                      {roleObj.shortName}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 pl-2 text-right">
                                  <button
                                    type="button"
                                    title="Toggle Alive / Eliminated status"
                                    onClick={() =>
                                      commitGameState((prev) => ({
                                        ...prev,
                                        players: prev.players.map((pl) =>
                                          pl.id === p.id
                                            ? {
                                                ...pl,
                                                status:
                                                  pl.status === 'ALIVE'
                                                    ? 'ELIMINATED'
                                                    : 'ALIVE',
                                              }
                                            : pl
                                        ),
                                      }))
                                    }
                                    className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full cursor-pointer ${
                                      isAlive
                                        ? 'bg-[#EBF3F0] text-[#1C4538]'
                                        : 'bg-[#F9ECEC] text-[#8B2626]'
                                    }`}
                                  >
                                    {p.status}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Parlor Chronicle Log */}
                  <div
                    className={`border rounded-3xl p-6 shadow-sm transition-colors duration-700 ${
                      isNocturnalNight
                        ? 'bg-[#173329] border-[#284C3F] text-[#F5EFE6]'
                        : 'bg-[#FFFDF9] border-[#E5DEC9] text-[#14362B]'
                    }`}
                  >
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[#9E7642] font-semibold block mb-1">
                      PARLOR RECORD
                    </span>
                    <h4
                      className={`font-serif text-xl mb-3 ${
                        isNocturnalNight ? 'text-[#F5EFE6]' : 'text-[#14362B]'
                      }`}
                    >
                      Chronicle of Events
                    </h4>
                    <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                      {gameState.chronicle
                        .slice()
                        .reverse()
                        .map((entry) => (
                          <div
                            key={entry.id}
                            className={`p-3 rounded-xl border text-xs ${
                              isNocturnalNight
                                ? 'bg-[#0D1F19] border-[#284C3F]'
                                : 'bg-[#FAF7F0] border-[#E5DEC9]'
                            }`}
                          >
                            <p
                              className={`font-serif font-semibold ${
                                isNocturnalNight
                                  ? 'text-[#E6C694]'
                                  : 'text-[#14362B]'
                              }`}
                            >
                              {entry.title}
                            </p>
                            <p
                              className={`mt-0.5 leading-relaxed ${
                                isNocturnalNight
                                  ? 'text-[#C8D6D0]'
                                  : 'text-[#4A5D56]'
                              }`}
                            >
                              {entry.detail}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* EDITORIAL FOOTER */}
      <footer
        className={`w-full border-t py-5 px-4 sm:px-8 mt-12 transition-colors duration-700 ${
          isNocturnalNight
            ? 'border-[#284C3F] bg-[#0D1F19]/90 text-[#9AB0A6]'
            : 'border-[#E5DEC9] bg-[#FAF7F0]/80 text-[#4A5D56]'
        }`}
      >
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`font-serif italic ${
                isNocturnalNight ? 'text-[#F5EFE6]' : 'text-[#14362B]'
              }`}
            >
              The Parlor Chit
            </span>
            <span>•</span>
            <span>Tactile Social Deduction for 5–16 Guests</span>
          </div>
          <div>
            <span>
              Roles: Murderer • Physician • Inspector • Constable • Guest
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
