import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
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
