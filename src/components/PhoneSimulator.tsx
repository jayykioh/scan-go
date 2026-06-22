import React, { useState, useEffect } from 'react';

interface PhoneSimulatorProps {
  children: React.ReactNode;
  actorName: string;
  actorColor: string;
  onboardStatus: string;
  nfcActive?: boolean;
}

export default function PhoneSimulator({
  children,
  actorName,
  actorColor,
  onboardStatus,
  nfcActive = false,
}: PhoneSimulatorProps) {
  const [time, setTime] = useState('12:00');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours().toString().padStart(2, '0');
      let minutes = now.getMinutes().toString().padStart(2, '0');
      setTime(`${hours}:${minutes}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative mx-auto max-w-[370px] w-full" id={`phone-simulator-${actorName.toLowerCase()}`}>
      {/* Outer Phone Bezel */}
      <div className="relative bg-zinc-950 border-4 border-zinc-900 rounded-[48px] shadow-[0_20px_50px_rgba(9,9,11,0.2)] overflow-hidden aspect-[9/18.5] w-full flex flex-col ring-8 ring-zinc-200/30">
        
        {/* Antenna band lines */}
        <div className="absolute top-12 -left-1 w-1 h-3 bg-zinc-700/60 rounded-r z-50"></div>
        <div className="absolute top-36 -right-1 w-1 h-3 bg-zinc-700/60 rounded-l z-50"></div>

        {/* Status Bar */}
        <div className="px-6 pt-3 pb-2 flex justify-between items-center bg-white border-b border-[#B5C7D8]/50 z-40 text-[11px] font-bold text-[#2D2B30] select-none text-balance">
          <div className="flex items-center gap-1">
            <span className="tabular-nums">{time}</span>
          </div>
          
          {/* Dynamic Action / Island simulation */}
          <div className="absolute left-1/2 transform -translate-x-1/2 top-2 w-28 h-5.5 bg-black rounded-full flex items-center justify-center gap-1.5 z-50 border border-zinc-800/50">
            {nfcActive ? (
              <div className="flex items-center gap-1 px-2 py-0.5">
                <span className="w-1.5 h-1.5 bg-[#155BD0] rounded-full animate-ping"></span>
                <span className="text-[8px] text-[#155BD0] uppercase font-mono tracking-wider font-semibold">NFC Active</span>
              </div>
            ) : (
              <>
                <div className="w-2.5 h-2.5 bg-neutral-900 rounded-full border border-neutral-700/60"></div>
                <div className="w-1 h-1 bg-neutral-950 rounded-full"></div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* LTE Indicator */}
            <span className="font-bold text-[8px] bg-zinc-100 px-1 py-0.2 rounded text-zinc-800">5G</span>
            {/* Battery Icon */}
            <div className="flex items-center gap-0.5">
              <div className="w-5 h-2.5 border border-zinc-400 rounded-sm p-0.5 flex items-center">
                <div className="h-full bg-zinc-900 w-[92%] rounded-[1px]"></div>
              </div>
              <div className="w-0.5 h-1 bg-zinc-400 rounded-r-xs"></div>
            </div>
          </div>
        </div>

        {/* Floating App Badge Indicator */}
        <div className="bg-white px-4 py-1.5 flex justify-between items-center border-b border-[#B5C7D8]/50 select-none">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: '#155BD0' }}></span>
            <span className="text-[10px] font-bold text-[#2D2B30] tracking-wider uppercase">
              ROLE: {actorName.toUpperCase()}
            </span>
          </div>
          <span className="text-[9px] bg-[#F5F5F7] text-[#2D2B30] px-1.5 py-0.5 rounded-[21px] font-bold border border-[#B5C7D8]/50 uppercase tracking-wide">
            {onboardStatus}
          </span>
        </div>

        {/* Simulator Screen Area */}
        <div className="flex-1 overflow-y-auto bg-white flex flex-col relative" style={{ wordBreak: 'break-word' }}>
          {children}
        </div>

        {/* Home Indicator Bar */}
        <div className="bg-white py-1.5 flex justify-center items-center z-40 select-none">
          <div className="w-24 h-1 bg-zinc-200 rounded-full"></div>
        </div>

      </div>

      {/* Screen Holder/Pedestal Style shadow */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-4/5 h-2 bg-gradient-to-r from-transparent via-zinc-900/10 to-transparent blur-md rounded-full shadow-lg"></div>
    </div>
  );
}
