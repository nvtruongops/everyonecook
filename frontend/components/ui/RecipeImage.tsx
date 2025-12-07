'use client';
import OptimizedImage from './OptimizedImage';

interface Props {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  aspectRatio?: 'square' | 'video' | 'wide';
}

export default function RecipeImage({
  src,
  alt,
  priority = false,
  className = '',
  aspectRatio = 'video',
}: Props) {
  const aspects: Record<string, string> = {
    square: 'aspect-square',
    video: 'aspect-video',
    wide: 'aspect-[21/9]',
  };
  return (
    <div
      className={`relative w-full ${aspects[aspectRatio]} ${className} overflow-hidden rounded-xl`}
    >
      <OptimizedImage
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 800px"
        objectFit="cover"
        quality={85}
        className="rounded-xl"
      />
    </div>
  );
}
