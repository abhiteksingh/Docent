import React, { useState, useRef, useEffect } from "react";

export default function InfoTooltip({ text, isLight = false, align = "auto", placement = "auto" }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ isTop: true, horizontalStyle: { left: "50%", transform: "translateX(-50%)" } });
  const containerRef = useRef(null);

  const calculatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const screenWidth = window.innerWidth;

    // Determine vertical placement:
    // Prefer "top" so it does not cover lists, cards, or interactive buttons below section headers
    let isTop = true;
    if (placement === "bottom") {
      isTop = false;
    } else if (placement === "top") {
      isTop = true;
    } else {
      // "auto": place on top if there's at least 90px above, otherwise place on bottom
      isTop = rect.top >= 90;
    }

    // Determine horizontal alignment:
    let horizontal = {};
    if (align === "right" || (align === "auto" && screenWidth - rect.right < 140)) {
      // Near right edge: anchor right edge to the icon so it expands cleanly to the left
      horizontal = { right: "-4px", left: "auto", transform: "none" };
    } else if (align === "left" || (align === "auto" && rect.left < 120)) {
      // Near left edge: anchor left edge to the icon so it expands cleanly to the right
      horizontal = { left: "-4px", right: "auto", transform: "none" };
    } else {
      // Centered directly relative to the icon
      horizontal = { left: "50%", right: "auto", transform: "translateX(-50%)" };
    }

    setCoords({ isTop, horizontalStyle: horizontal });
  };

  const handleOpen = () => {
    calculatePosition();
    setVisible(true);
  };

  const handleClose = () => {
    setVisible(false);
  };

  // Close on outside click when toggled
  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setVisible(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [visible]);

  return (
    <span 
      ref={containerRef}
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      className="relative inline-flex items-center ml-1 select-none font-sans font-normal normal-case z-30"
    >
      <button 
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (visible) handleClose();
          else handleOpen();
        }}
        className={`w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px] font-bold cursor-help transition-all duration-150 shrink-0 ${
          isLight
            ? "bg-zinc-200/80 hover:bg-[#4C8DFF]/20 text-zinc-600 hover:text-[#4C8DFF] border border-zinc-300/40"
            : visible
              ? "bg-[#3ECF8E] text-black shadow-sm scale-105"
              : "bg-[#2A2A2A] hover:bg-[#3ECF8E] text-zinc-400 hover:text-black"
        }`}
        aria-label="Information"
      >
        i
      </button>

      {visible && (
        <span 
          style={{
            position: "absolute",
            ...(coords.isTop ? { bottom: "calc(100% + 7px)" } : { top: "calc(100% + 7px)" }),
            ...coords.horizontalStyle,
            zIndex: 99999,
            width: "max-content",
            minWidth: "170px",
            maxWidth: "225px",
            backgroundColor: isLight ? "#FFFFFF" : "#141416",
            border: isLight ? "1px solid #D4D4D8" : "1px solid #333338",
            color: isLight ? "#18181B" : "#F4F4F5",
            fontSize: "10px",
            lineHeight: "1.4",
            padding: "7px 10px",
            borderRadius: "8px",
            boxShadow: isLight
              ? "0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.06)"
              : "0 12px 28px -4px rgba(0, 0, 0, 0.9), 0 8px 12px -6px rgba(0, 0, 0, 0.7)",
            pointerEvents: "auto",
            textAlign: "left",
            whiteSpace: "normal",
            textTransform: "none",
            letterSpacing: "normal",
            fontWeight: 400
          }}
          className="animate-fade-in"
        >
          {text}

          {/* Caret / Arrow pointing to the (i) button */}
          <span 
            style={{
              position: "absolute",
              width: "6px",
              height: "6px",
              backgroundColor: isLight ? "#FFFFFF" : "#141416",
              borderRight: isLight ? "1px solid #D4D4D8" : "1px solid #333338",
              borderBottom: isLight ? "1px solid #D4D4D8" : "1px solid #333338",
              transform: coords.isTop ? "rotate(45deg)" : "rotate(225deg)",
              ...(coords.isTop ? { bottom: "-4px" } : { top: "-4px" }),
              ...(coords.horizontalStyle.right 
                ? { right: "8px" } 
                : coords.horizontalStyle.left === "-4px" 
                  ? { left: "8px" } 
                  : { left: "calc(50% - 3px)" })
            }}
          />
        </span>
      )}
    </span>
  );
}
