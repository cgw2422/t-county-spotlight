import Image, { type ImageProps } from "next/image";

/** next/image wrapper that skips optimization for SVG / data URIs. */
export function SmartImage(props: Omit<ImageProps, "src"> & { src: string }) {
  const unoptimized = props.src.endsWith(".svg") || props.src.startsWith("data:");
  return <Image {...props} unoptimized={unoptimized || props.unoptimized} />;
}
