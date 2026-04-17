"use client";

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";

type PodiumPlayer = {
  id: string;
  name: string;
  score: number;
  avatar?: string;
  rank: number;
};

type PodiumProps = {
  topPlayers: PodiumPlayer[];
};

type RankStyle = {
  heightClass: string;
  gradientClass: string;
  label: string;
  blockDelay: number;
};

const rankStyles: Record<number, RankStyle> = {
  1: {
    heightClass: "h-60 md:h-72",
    gradientClass: "bg-gradient-to-t from-amber-500 to-yellow-300",
    label: "1st Place",
    blockDelay: 0.5,
  },
  2: {
    heightClass: "h-44 md:h-56",
    gradientClass: "bg-gradient-to-t from-slate-400 to-slate-200",
    label: "2nd Place",
    blockDelay: 0.25,
  },
  3: {
    heightClass: "h-36 md:h-48",
    gradientClass: "bg-gradient-to-t from-orange-600 to-orange-400",
    label: "3rd Place",
    blockDelay: 0,
  },
};

function initialsFromName(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Podium({ topPlayers }: PodiumProps) {
  const visualOrder = useMemo(() => {
    const playersByRank = new Map(topPlayers.map((player) => [player.rank, player]));
    const fallback = [...topPlayers];

    return [2, 1, 3].map((rank, idx) => {
      const existing = playersByRank.get(rank);
      if (existing) return existing;

      return (
        fallback[idx] ?? {
          id: `placeholder-${rank}`,
          name: `Player ${rank}`,
          score: 0,
          avatar: "",
          rank,
        }
      );
    });
  }, [topPlayers]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      confetti({
        particleCount: 280,
        spread: 160,
        startVelocity: 48,
        scalar: 1.15,
        ticks: 280,
        origin: { x: 0.5, y: 0.58 },
      });

      confetti({
        particleCount: 120,
        angle: 65,
        spread: 70,
        origin: { x: 0.08, y: 0.72 },
      });

      confetti({
        particleCount: 120,
        angle: 115,
        spread: 70,
        origin: { x: 0.92, y: 0.72 },
      });
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <section className="w-full bg-slate-50 py-10 px-4 md:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-end justify-center gap-4 md:gap-8">
          {visualOrder.map((player) => {
            const rank = player.rank === 1 || player.rank === 2 || player.rank === 3 ? player.rank : 3;
            const style = rankStyles[rank];
            const avatarDelay = style.blockDelay + 0.3;

            return (
              <div key={player.id} className="flex w-[30%] min-w-[96px] max-w-[220px] flex-col items-center">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: avatarDelay, ease: "easeOut" }}
                  className="mb-3 flex flex-col items-center text-center"
                >
                  <motion.div
                    whileHover={{ scale: 1.06 }}
                    className="mb-2 h-14 w-14 md:h-16 md:w-16 overflow-hidden rounded-full ring-4 ring-white shadow-2xl"
                  >
                    {player.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={player.avatar}
                        alt={player.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-indigo-100 text-indigo-700 font-black">
                        {initialsFromName(player.name)}
                      </div>
                    )}
                  </motion.div>
                  <p className="text-sm md:text-base font-black text-slate-900 truncate max-w-full">
                    {player.name}
                  </p>
                  <p className="text-xs md:text-sm font-semibold text-slate-500">
                    {player.score.toLocaleString()} pts
                  </p>
                </motion.div>

                <motion.div
                  initial={{ y: 200, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.75, delay: style.blockDelay, ease: [0.2, 0.7, 0.2, 1] }}
                  className={`relative w-full ${style.heightClass} ${style.gradientClass} rounded-t-2xl shadow-2xl border border-white/50`}
                >
                  <div className="absolute inset-x-0 bottom-3 text-center">
                    <p className="text-[10px] md:text-xs font-bold uppercase tracking-[0.15em] text-white/90">
                      {style.label}
                    </p>
                    <p className="text-2xl md:text-3xl font-black text-white drop-shadow">
                      #{rank}
                    </p>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
