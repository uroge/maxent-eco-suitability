import { ImageResponse } from 'next/og';
import { BrandMark } from '@ecosuitability/ui';

export const size = {
  height: 64,
  width: 64,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: '#1f6657',
        borderRadius: 14,
        color: '#ffffff',
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      <BrandMark height="46" width="46" />
    </div>,
    size
  );
}
