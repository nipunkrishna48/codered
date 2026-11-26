import React from "react";

export const Logo: React.FC<{ size?: "sm" | "md" | "lg" }> = ({ size = "md" }) => {
  const dim = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div
        className={`${dim} relative flex items-center justify-center rounded-lg bg-gradient-to-br from-violet-600/30 via-purple-600/20 to-amber-500/20 border border-violet-500/40 shadow-lg shadow-violet-950/40`}
      >
        <svg viewBox="0 0 24 24" className="w-4/6 h-4/6 text-violet-300" fill="none" stroke="currentColor" strokeWidth="1.9">
          <circle cx="6" cy="6" r="2.3" className="fill-violet-400/30 stroke-violet-300" />
          <circle cx="18" cy="7" r="2.3" className="fill-amber-400/30 stroke-amber-300" />
          <circle cx="12" cy="18" r="2.5" className="fill-purple-400/30 stroke-purple-300" />
          <path d="M8.1 6.4L15.7 6.9M7.2 8.1L10.8 15.8M16.9 9.1L13.2 15.8" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex flex-col leading-none">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold tracking-tight text-zinc-100 text-sm">CodeAtlas</span>
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/25">
            Intel
          </span>
        </div>
        <span className="text-[10px] text-zinc-500 tracking-wide mt-0.5">by Team Eternals</span>
      </div>
    </div>
  );
};
