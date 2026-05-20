"use client";

import { useEffect, useRef, useState } from "react";

interface HeroVideoLoopProps {
  clips: string[];
  poster?: string;
  className?: string;
}

export function HeroVideoLoop({ clips, poster, className }: HeroVideoLoopProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);

  // Swap src and play on index change (hard cut — no crossfade)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || clips.length === 0) return;
    video.src = clips[index];
    video.load();
    video.play().catch(() => {
      // Autoplay blocked by browser — poster stays visible until user interacts
    });
  }, [index, clips]);

  function handleEnded() {
    setIndex((i) => (i + 1) % clips.length);
  }

  if (clips.length === 0) return null;

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      poster={poster}
      onEnded={handleEnded}
      className={className}
    />
  );
}
