import sharp from "sharp";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#ec4899"/>
  <circle cx="186" cy="200" r="70" fill="#fff" opacity="0.95"/>
  <circle cx="326" cy="200" r="70" fill="#fff" opacity="0.95"/>
  <path d="M116 200 a70 70 0 0 0 140 0 a70 70 0 0 0 140 0 q0 110 -140 210 q-140 -100 -140 -210 z" fill="#fff" opacity="0.95"/>
</svg>`;
const buf = Buffer.from(svg);
await sharp(buf).resize(512, 512).png().toFile("public/icon-512.png");
await sharp(buf).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(buf).resize(180, 180).png().toFile("public/apple-touch-icon.png");
console.log("icons done");
