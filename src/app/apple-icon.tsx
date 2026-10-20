import { ImageResponse } from "next/og";
import { LogoImage } from "./logo-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<LogoImage size={180} />, size);
}
