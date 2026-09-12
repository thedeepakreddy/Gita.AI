import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Full-bleed backgrounds are requested at 100vw, so the widths that matter
    // are real device widths — including the 2560/3840 ones the default list
    // stops short of, where a 1920 source would otherwise be upscaled by the
    // browser and look soft.
    deviceSizes: [420, 640, 828, 1080, 1200, 1440, 1920, 2560, 3840],
    // Both offered; the browser takes whichever it can decode. AVIF is
    // materially smaller on painted artwork with large flat areas.
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    // onnxruntime-node is a native binding; bundling it breaks the require of
    // its .node file. Keep it (and the library that loads it) external.
    serverComponentsExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],
  },
};

export default withNextIntl(nextConfig);
