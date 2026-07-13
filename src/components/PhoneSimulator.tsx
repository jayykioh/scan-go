import React, { useState, useEffect } from 'react';

interface PhoneSimulatorProps {
  children: React.ReactNode;
  actorName: string;
  actorColor: string;
  onboardStatus: string;
  nfcActive?: boolean;
  isTablet?: boolean;
}

export default function PhoneSimulator({
  children,
  actorName,
  actorColor,
  onboardStatus,
  nfcActive = false,
  isTablet = false
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

  // Determine styles based on tablet vs phone mode
  const containerClasses = isTablet 
    ? "relative mx-auto w-full h-full" 
    : "relative mx-auto max-w-[370px] w-full h-full";
    
  const bezelClasses = isTablet
    ? "relative bg-zinc-950 border-4 border-zinc-900 rounded-[32px] shadow-[0_20px_50px_rgba(9,9,11,0.2)] overflow-hidden w-full h-full flex flex-col ring-8 ring-zinc-200/30"
    : "relative bg-zinc-950 border-4 border-zinc-900 rounded-[48px] shadow-[0_20px_50px_rgba(9,9,11,0.2)] overflow-hidden aspect-[9/18.5] w-full flex flex-col ring-8 ring-zinc-200/30";

  return (
    <div className={containerClasses} id={`phone-simulator-${actorName.toLowerCase()}`}>
      <div className={bezelClasses}>
        
        {/* Status Bar */}
        <div className="px-6 pt-3 pb-2 flex justify-between items-center bg-white border-b border-[#B5C7D8]/50 z-40 text-[11px] font-bold text-[#2D2B30] select-none">
          <div className="flex items-center gap-1">
            <span className="tabular-nums">{time}</span>
          </div>
          
          {/* Dynamic Action / Island simulation (Phone only) */}
          {!isTablet && (
            <div className="absolute left-1/2 transform -translate-x-1/2 top-2.5 w-[110px] h-[30px] bg-black rounded-full flex items-center justify-center gap-2 z-50">
              {nfcActive ? (
                <div className="flex items-center gap-1.5 px-2">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-[10px] text-emerald-500 uppercase font-semibold">NFC</span>
                </div>
              ) : (
                <>
                  <div className="w-3.5 h-3.5 bg-[#111] rounded-full border border-white/5"></div>
                  <div className="w-3.5 h-3.5 bg-[#111] rounded-full border border-white/5"></div>
                </>
              )}
            </div>
          )}

          {/* iPad-like top camera for tablet */}
          {isTablet && (
             <div className="absolute left-1/2 transform -translate-x-1/2 top-3 flex items-center justify-center">
                <div className="w-2 h-2 bg-black rounded-full border border-zinc-800"></div>
             </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[8px] bg-zinc-100 px-1 py-0.2 rounded text-zinc-800">{isTablet ? 'Wi-Fi' : '5G'}</span>
            <div className="flex items-center gap-0.5">
              <div className="w-5 h-2.5 border border-zinc-400 rounded-sm p-0.5 flex items-center">
                <div className="h-full bg-zinc-900 w-[92%] rounded-[1px]"></div>
              </div>
              <div className="w-0.5 h-1 bg-zinc-400 rounded-r-xs"></div>
            </div>
          </div>
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
    </div>
  );
}
