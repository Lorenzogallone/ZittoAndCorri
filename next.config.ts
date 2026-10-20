import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // I file FIT importati dal browser passano da una server action: con GPS,
    // cuore, cadenza, distanza e lap una corsa lunga supera il limite di 1 MB.
    // 4 MB resta sotto il tetto delle funzioni Vercel (4,5 MB).
    serverActions: {
      bodySizeLimit: "4mb",
    },
    // Cache lato client del router: tab-switch tra Home/Corse/Piano riusa il
    // segmento per 60s invece di rifare il render server + query Supabase a
    // ogni tap. revalidatePath() nelle server action invalida comunque subito.
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
};

export default nextConfig;
