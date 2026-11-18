import React, { useState } from 'react';

// Kompaniya logosi (asli: drilling.topfinresult.uz/assets/logo-light.svg). Internetsiz ishlaydi.
//   light — och fon uchun (client/public/logo-light.svg, asl fayl)
//   dark  — to'q fon uchun (client/public/logo-dark.svg, scripts/make-logo-dark.cjs yasaydi)
// Fayl topilmasa — yozuv ko'rinishida.
const SRC = { light: '/logo-light.svg', dark: '/logo-dark.svg' };

export default function Logo({ variant = 'light', className = '', height }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={`logo-text ${className}`} style={height ? { fontSize: height * 0.36 } : undefined}>
        TOPFIN <b>RESULT</b>
      </span>
    );
  }
  return <img className={`logo ${className}`} src={SRC[variant]} alt="Topfin Result" style={height ? { height } : undefined} onError={() => setFailed(true)} />;
}
