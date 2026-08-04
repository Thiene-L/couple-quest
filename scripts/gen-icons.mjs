import sharp from "sharp";

// 应用图标：粉白底 + 红蝴蝶结。取 Hello Kitty 的配色和蝴蝶结意象，
// 不复制角色形象本身（那是 Sanrio 的版权美术）
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#FFF5F7"/>
  <g transform="translate(256 264)">
    <path d="M-18 0 C-18 -64 -80 -98 -124 -68 C-168 -38 -160 34 -110 58 C-72 74 -32 50 -18 18 Z" fill="#E4002B"/>
    <path d="M18 0 C18 -64 80 -98 124 -68 C168 -38 160 34 110 58 C72 74 32 50 18 18 Z" fill="#E4002B"/>
    <ellipse cx="0" cy="6" rx="31" ry="35" fill="#C4001F"/>
    <circle cx="-80" cy="-18" r="11" fill="#FFFFFF" opacity="0.9"/>
    <circle cx="80" cy="-18" r="11" fill="#FFFFFF" opacity="0.9"/>
    <circle cx="-54" cy="28" r="8" fill="#FFFFFF" opacity="0.75"/>
    <circle cx="54" cy="28" r="8" fill="#FFFFFF" opacity="0.75"/>
  </g>
  <circle cx="116" cy="126" r="14" fill="#FFC800"/>
  <circle cx="398" cy="148" r="10" fill="#FFC800" opacity="0.85"/>
</svg>`;

const buf = Buffer.from(svg);
await sharp(buf).resize(512, 512).png().toFile("public/icon-512.png");
await sharp(buf).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(buf).resize(180, 180).png().toFile("public/apple-touch-icon.png");
console.log("icons done");
