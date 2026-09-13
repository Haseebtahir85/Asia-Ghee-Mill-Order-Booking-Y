import localFont from "next/font/local";
import { Noto_Nastaliq_Urdu } from "next/font/google";

// --- Jameel Noori Nastaleeq (local) ---
// You need the actual font file for this to work — Next.js can't fetch it
// for you. Get JameelNooriNastaleeq.ttf (or .woff2, if you've converted it)
// and place it at: public/fonts/JameelNooriNastaleeq.ttf
//
// Make sure you have the right to use/host this specific font file in your
// project (check its license/EULA) — it's a widely used freeware font in
// Pakistan for Urdu typesetting, but redistribution terms vary by source.
export const jameelNoori = localFont({
  src: [
    {
      path: "../public/fonts/JameelNooriNastaleeq.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-jameel-noori",
  display: "swap",
});

// --- Noto Nastaliq Urdu (Google Fonts) ---
// Free, properly licensed, and needs no font file of your own — Next.js
// downloads and self-hosts it at build time. Use this immediately, and/or
// as the fallback if Jameel Noori Nastaleeq fails to load for some reason.
export const notoNastaliq = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: "400",
  variable: "--font-noto-nastaliq",
  display: "swap",
});